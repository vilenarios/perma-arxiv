import * as duckdb from 'duckdb';
import path from 'path';
import fs from 'fs/promises';
import { Database } from '../database';
import logger from '../utils/logger';

const SCHEMA_VERSION = 2; // Increment when schema changes

export class OptimizedParquetExporter {
  private db: Database;
  private duckDb: duckdb.Database;
  private conn: duckdb.Connection;
  private indexDir: string;

  constructor(dbPath?: string) {
    this.db = new Database(dbPath);
    this.duckDb = new duckdb.Database(':memory:');
    this.conn = this.duckDb.connect();
    this.indexDir = './index';
  }

  async exportOptimized(outputDir: string = './index'): Promise<string> {
    logger.info('Creating optimized Parquet for HTTP range requests...');

    await this.db.initialize();
    await fs.mkdir(outputDir, { recursive: true });

    try {
      // Create temp table in DuckDB
      await this.createDuckDBTable();

      // Stream papers in batches to avoid loading all into memory
      await this.streamPapersToTable();

      // Export with optimizations for range requests
      const outputPath = path.join(outputDir, `arxiv_optimized_${Date.now()}.parquet`);

      await new Promise<void>((resolve, reject) => {
        this.conn.exec(`
          COPY (
            SELECT * FROM papers
            ORDER BY published DESC  -- Most recent first
          ) TO '${outputPath.replace(/\\/g, '/')}'
          (
            FORMAT PARQUET,
            COMPRESSION 'ZSTD',
            ROW_GROUP_SIZE 100000,  -- Optimize for partial reads
            STATS_ENABLED TRUE      -- Enable statistics for faster queries
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Get file size
      const stats = await fs.stat(outputPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      logger.info(`✅ Created optimized Parquet: ${path.basename(outputPath)} (${sizeMB} MB)`);
      logger.info('Optimizations applied:');
      logger.info('  - Sorted by date (newest first)');
      logger.info('  - Row group size optimized for partial reads');
      logger.info('  - Statistics enabled for query optimization');
      logger.info('  - ZSTD compression for smaller size');

      // Get actual paper count from DuckDB
      const paperCount = await this.getPaperCount();

      // Create metadata file
      await this.createMetadata(outputPath, paperCount);

      return outputPath;

    } finally {
      await this.cleanup();
    }
  }

  private async getPaperCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.conn.all('SELECT COUNT(*) as count FROM papers', (err, result: any) => {
        if (err) reject(err);
        else resolve(result[0].count);
      });
    });
  }

  private async streamPapersToTable(): Promise<void> {
    const BATCH_SIZE = 1000;
    let offset = 0;
    let totalExported = 0;

    while (true) {
      const batch = await this.getPapersBatch(offset, BATCH_SIZE);
      if (batch.length === 0) break;

      await this.insertPapersOptimized(batch);
      totalExported += batch.length;

      if (totalExported % 5000 === 0) {
        logger.info(`Exported ${totalExported} papers...`);
      }

      offset += BATCH_SIZE;
    }

    logger.info(`✅ Total papers exported: ${totalExported}`);
  }

  private async getPapersBatch(offset: number, limit: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db['db'].all(
        `SELECT
          p.id,
          p.version,
          p.updated,
          p.published,
          CAST(strftime('%Y', p.published) AS INTEGER) as year,
          CAST(strftime('%m', p.published) AS INTEGER) as month,
          p.title,
          p.summary,
          p.authors,
          p.categories,
          p.pdf_url,
          p.abstract_url,
          p.comment,
          p.journal_ref,
          p.doi,
          p.downloaded,
          p.download_path,
          p.download_date,
          p.transaction_id,
          p.upload_date
        FROM papers p
        ORDER BY p.published DESC
        LIMIT ? OFFSET ?`,
        [limit, offset],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  private async createDuckDBTable(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.conn.exec(`
        CREATE TABLE papers (
          _schema_version INTEGER,
          id VARCHAR,
          version INTEGER,
          updated TIMESTAMP,
          published TIMESTAMP,
          year INTEGER,
          month INTEGER,
          title VARCHAR,
          summary VARCHAR,
          authors VARCHAR,
          primary_category VARCHAR,
          all_categories VARCHAR,
          category_count INTEGER,
          pdf_url VARCHAR,
          html_url VARCHAR,
          abstract_url VARCHAR,
          comment VARCHAR,
          journal_ref VARCHAR,
          doi VARCHAR,
          downloaded BOOLEAN,
          download_format VARCHAR,
          download_path VARCHAR,
          download_date TIMESTAMP,
          transaction_id VARCHAR,
          upload_date TIMESTAMP,
          file_size_mb DOUBLE,
          word_count INTEGER
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async insertPapersOptimized(papers: any[]): Promise<void> {
    // Process papers into safe objects for batch insert
    const rows = papers.map(paper => {
      const categories = paper.categories ? JSON.parse(paper.categories) : [];
      const primaryCategory = categories.length > 0 ? categories[0] : '';
      const allCategories = categories.join(',');
      const categoryCount = categories.length;

      return {
        _schema_version: SCHEMA_VERSION,
        id: paper.id || '',
        version: paper.version || 1,
        updated: paper.updated || '',
        published: paper.published || '',
        year: paper.year || 0,
        month: paper.month || 0,
        title: paper.title || '',
        summary: paper.summary || '',
        authors: paper.authors || '',
        primary_category: primaryCategory,
        all_categories: allCategories,
        category_count: categoryCount,
        pdf_url: paper.pdf_url || '',
        html_url: paper.html_url || '',
        abstract_url: paper.abstract_url || '',
        comment: paper.comment || null,
        journal_ref: paper.journal_ref || null,
        doi: paper.doi || null,
        downloaded: paper.downloaded ? true : false,
        download_format: paper.download_format || null,
        download_path: paper.download_path || null,
        download_date: paper.download_date || null,
        transaction_id: paper.transaction_id || null,
        upload_date: paper.upload_date || null,
        file_size_mb: paper.file_size_mb || null,
        word_count: paper.word_count || null
      };
    });

    // Write to temporary JSON file for DuckDB to read
    const tempJsonPath = path.join(this.indexDir, 'temp_import.json');
    await fs.writeFile(tempJsonPath, JSON.stringify(rows));

    try {
      // Use DuckDB's JSON reader for safe bulk insert
      await new Promise<void>((resolve, reject) => {
        this.conn.exec(`
          INSERT INTO papers
          SELECT * FROM read_json_auto('${tempJsonPath.replace(/\\/g, '/')}')
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      logger.info(`Inserted ${rows.length} papers using bulk import`);
    } finally {
      // Clean up temp file
      await fs.unlink(tempJsonPath).catch(() => {});
    }
  }

  private async createMetadata(parquetPath: string, paperCount: number): Promise<void> {
    const stats = await fs.stat(parquetPath);

    const metadata = {
      created: new Date().toISOString(),
      file: path.basename(parquetPath),
      papers: paperCount,
      sizeBytes: stats.size,
      sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
      optimizations: {
        sorted: 'published DESC',
        rowGroupSize: 100000,
        compression: 'ZSTD',
        statistics: true
      },
      queryHints: {
        recentPapers: 'LIMIT queries will be fast due to date sorting',
        rangeRequests: 'Supports HTTP range requests for partial downloads',
        estimatedBytesPerQuery: {
          browse: '~1-5 MB (metadata only)',
          search: '~5-20 MB (with text search)',
          fullScan: `${stats.size} bytes (entire file)`
        }
      }
    };

    const metadataPath = path.join(
      path.dirname(parquetPath),
      'metadata.json'
    );

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    logger.info(`Created metadata file: ${path.basename(metadataPath)}`);
  }

  private async cleanup(): Promise<void> {
    this.conn.close();
    this.duckDb.close();
    await this.db.close();
  }
}