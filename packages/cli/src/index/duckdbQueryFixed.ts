import * as duckdb from 'duckdb';
import path from 'path';
import fs from 'fs/promises';
import { QueryOptions, ParquetPaperRecord, IndexStats } from './types';
import logger from '../utils/logger';

export class DuckDBQuery {
  private db: duckdb.Database;
  private conn: duckdb.Connection;
  private indexDir: string;
  private isInitialized: boolean = false;

  constructor(indexDir: string = './index') {
    this.db = new duckdb.Database(':memory:');
    this.conn = this.db.connect();
    this.indexDir = indexDir;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const files = await fs.readdir(this.indexDir);
      const parquetFiles = files.filter(f => f.endsWith('.parquet'));

      if (parquetFiles.length === 0) {
        throw new Error('No Parquet files found in index directory');
      }

      logger.info(`Loading ${parquetFiles.length} Parquet files into DuckDB...`);

      // Use promise wrapper for callback-based API
      await new Promise<void>((resolve, reject) => {
        this.conn.exec(`
          CREATE TABLE IF NOT EXISTS papers AS
          SELECT * FROM read_parquet('${path.join(this.indexDir, '*.parquet')}')
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Create indexes
      await new Promise<void>((resolve, reject) => {
        this.conn.exec(`
          CREATE INDEX IF NOT EXISTS idx_category ON papers(primary_category);
          CREATE INDEX IF NOT EXISTS idx_year ON papers(year);
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Get count
      const count = await new Promise<number>((resolve, reject) => {
        this.conn.all('SELECT COUNT(*) as count FROM papers', (err, result: any[]) => {
          if (err) reject(err);
          else resolve(result[0].count);
        });
      });

      logger.info(`Loaded ${count} papers into DuckDB`);
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize DuckDB', { error });
      throw error;
    }
  }

  async query(options: QueryOptions = {}): Promise<ParquetPaperRecord[]> {
    await this.initialize();

    let sql = 'SELECT * FROM papers WHERE 1=1';
    const params: any[] = [];

    if (options.categories && options.categories.length > 0) {
      const categoryConditions = options.categories.map(() => 'all_categories LIKE ?').join(' OR ');
      sql += ` AND (${categoryConditions})`;
      options.categories.forEach(cat => params.push(`%${cat}%`));
    }

    if (options.authors && options.authors.length > 0) {
      const authorConditions = options.authors.map(() => 'authors LIKE ?').join(' OR ');
      sql += ` AND (${authorConditions})`;
      options.authors.forEach(author => params.push(`%${author}%`));
    }

    if (options.dateRange) {
      if (options.dateRange.start) {
        sql += ' AND published >= ?';
        params.push(options.dateRange.start.toISOString());
      }
      if (options.dateRange.end) {
        sql += ' AND published <= ?';
        params.push(options.dateRange.end.toISOString());
      }
    }

    if (options.searchText) {
      sql += ' AND (LOWER(title) LIKE LOWER(?) OR LOWER(summary) LIKE LOWER(?))';
      params.push(`%${options.searchText}%`, `%${options.searchText}%`);
    }

    if (options.orderBy) {
      const orderColumn = options.orderBy === 'date' ? 'published' :
                          options.orderBy === 'citations' ? 'citation_count' :
                          'published';
      sql += ` ORDER BY ${orderColumn} ${options.orderDirection || 'DESC'}`;
    } else {
      sql += ' ORDER BY published DESC';
    }

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    try {
      const results = await new Promise<any[]>((resolve, reject) => {
        this.conn.all(sql, params, (err, rows) => {
          if (err) {
            logger.error('Query failed', { error: err, sql, params });
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });

      return results.map(row => ({
        ...row,
        updated: new Date(row.updated),
        published: new Date(row.published),
        download_date: row.download_date ? new Date(row.download_date) : undefined
      }));
    } catch (error) {
      logger.error('Query failed', { error });
      throw error;
    }
  }

  async searchFullText(searchText: string, limit: number = 100): Promise<ParquetPaperRecord[]> {
    await this.initialize();

    const sql = `
      SELECT *
      FROM papers
      WHERE LOWER(title) LIKE LOWER(?)
         OR LOWER(summary) LIKE LOWER(?)
         OR LOWER(authors) LIKE LOWER(?)
      ORDER BY published DESC
      LIMIT ?
    `;

    const searchPattern = `%${searchText}%`;
    const params = [searchPattern, searchPattern, searchPattern, limit];

    try {
      const results = await new Promise<any[]>((resolve, reject) => {
        this.conn.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      return results.map(row => ({
        ...row,
        updated: new Date(row.updated),
        published: new Date(row.published),
        download_date: row.download_date ? new Date(row.download_date) : undefined
      }));
    } catch (error) {
      logger.error('Full-text search failed', { error });
      throw error;
    }
  }

  async getStatistics(): Promise<IndexStats> {
    await this.initialize();

    const stats: IndexStats = {
      papersByCategory: new Map(),
      papersByYear: new Map(),
      topAuthors: [],
      downloadedCount: 0,
      totalSizeGb: 0,
      avgPaperSizeMb: 0
    };

    // Get papers by category
    const categoryResult = await new Promise<any[]>((resolve, reject) => {
      this.conn.all(`
        SELECT primary_category, COUNT(*) as count
        FROM papers
        GROUP BY primary_category
        ORDER BY count DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    categoryResult.forEach(row => {
      stats.papersByCategory.set(row.primary_category, row.count);
    });

    // Get papers by year
    const yearResult = await new Promise<any[]>((resolve, reject) => {
      this.conn.all(`
        SELECT year, COUNT(*) as count
        FROM papers
        GROUP BY year
        ORDER BY year DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    yearResult.forEach(row => {
      stats.papersByYear.set(row.year, row.count);
    });

    // Get download stats
    const downloadResult = await new Promise<any>((resolve, reject) => {
      this.conn.all(`
        SELECT
          COUNT(CASE WHEN downloaded = true THEN 1 END) as downloaded_count,
          AVG(file_size_mb) as avg_size,
          SUM(file_size_mb) / 1024 as total_gb
        FROM papers
      `, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows[0] || {});
      });
    });

    stats.downloadedCount = downloadResult.downloaded_count || 0;
    stats.avgPaperSizeMb = downloadResult.avg_size || 0;
    stats.totalSizeGb = downloadResult.total_gb || 0;

    return stats;
  }

  close(): void {
    this.conn.close();
    this.db.close();
  }
}