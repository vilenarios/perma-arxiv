import * as duckdb from 'duckdb';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger';

export class ParquetUpdater {
  private indexDir: string;

  constructor(indexDir: string = './index') {
    this.indexDir = indexDir;
  }

  async updateTransactionIds(updates: Map<string, { transactionId: string; uploadDate: Date }>): Promise<void> {
    if (updates.size === 0) {
      logger.info('No transaction IDs to update');
      return;
    }

    const db = new duckdb.Database(':memory:');
    const conn = db.connect();

    try {
      // Load existing Parquet files
      await new Promise<void>((resolve, reject) => {
        conn.exec(`
          CREATE TABLE papers AS
          SELECT * FROM read_parquet('${path.join(this.indexDir, '*.parquet')}')
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Update transaction IDs
      for (const [paperId, { transactionId, uploadDate }] of updates) {
        await new Promise<void>((resolve, reject) => {
          conn.exec(`
            UPDATE papers
            SET transaction_id = '${transactionId}',
                upload_date = '${uploadDate.toISOString()}'
            WHERE id = '${paperId}'
          `, (err) => {
            if (err) {
              logger.error(`Failed to update transaction ID for paper ${paperId}`, { error: err });
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }

      // Create backup of existing files
      const files = await fs.readdir(this.indexDir);
      const parquetFiles = files.filter(f => f.endsWith('.parquet'));

      for (const file of parquetFiles) {
        const filePath = path.join(this.indexDir, file);
        const backupPath = path.join(this.indexDir, `backup_${Date.now()}_${file}`);
        await fs.rename(filePath, backupPath);
        logger.info(`Backed up ${file} to ${path.basename(backupPath)}`);
      }

      // Export updated data to new Parquet file
      const outputPath = path.join(this.indexDir, `arxiv_index_updated_${Date.now()}.parquet`);

      await new Promise<void>((resolve, reject) => {
        conn.exec(`
          COPY papers TO '${outputPath}' (FORMAT PARQUET, COMPRESSION ZSTD)
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      logger.info(`Updated Parquet file created: ${path.basename(outputPath)}`);
      logger.info(`Updated ${updates.size} papers with transaction IDs`);

      // Clean up old backups (keep last 3)
      const backupFiles = (await fs.readdir(this.indexDir))
        .filter(f => f.startsWith('backup_'))
        .sort()
        .reverse();

      if (backupFiles.length > 3) {
        for (const oldBackup of backupFiles.slice(3)) {
          await fs.unlink(path.join(this.indexDir, oldBackup));
          logger.info(`Removed old backup: ${oldBackup}`);
        }
      }

    } catch (error) {
      logger.error('Failed to update Parquet files with transaction IDs', { error });
      throw error;
    } finally {
      conn.close();
      db.close();
    }
  }

  async getUploadedPapers(): Promise<Set<string>> {
    const db = new duckdb.Database(':memory:');
    const conn = db.connect();
    const uploadedIds = new Set<string>();

    try {
      // Load Parquet files
      await new Promise<void>((resolve, reject) => {
        conn.exec(`
          CREATE TABLE papers AS
          SELECT * FROM read_parquet('${path.join(this.indexDir, '*.parquet')}')
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Get papers with transaction IDs
      const results = await new Promise<any[]>((resolve, reject) => {
        conn.all(
          'SELECT id FROM papers WHERE transaction_id IS NOT NULL',
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      results.forEach(row => uploadedIds.add(row.id));

    } catch (error) {
      logger.error('Failed to get uploaded papers from Parquet', { error });
    } finally {
      conn.close();
      db.close();
    }

    return uploadedIds;
  }

  async createManifest(): Promise<void> {
    const db = new duckdb.Database(':memory:');
    const conn = db.connect();

    try {
      // Load Parquet files
      await new Promise<void>((resolve, reject) => {
        conn.exec(`
          CREATE TABLE papers AS
          SELECT * FROM read_parquet('${path.join(this.indexDir, '*.parquet')}')
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Get upload statistics
      const stats = await new Promise<any>((resolve, reject) => {
        conn.all(`
          SELECT
            COUNT(*) as total_papers,
            COUNT(transaction_id) as uploaded_papers,
            COUNT(*) - COUNT(transaction_id) as pending_papers,
            MIN(published) as earliest_paper,
            MAX(published) as latest_paper,
            COUNT(DISTINCT primary_category) as unique_categories
          FROM papers
        `, (err, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows[0]);
        });
      });

      // Get uploaded papers by category
      const byCategory = await new Promise<any[]>((resolve, reject) => {
        conn.all(`
          SELECT
            primary_category,
            COUNT(*) as total,
            COUNT(transaction_id) as uploaded
          FROM papers
          GROUP BY primary_category
          ORDER BY COUNT(transaction_id) DESC
        `, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      const manifest = {
        created_at: new Date().toISOString(),
        statistics: stats,
        categories: byCategory,
        index_files: await fs.readdir(this.indexDir).then(files =>
          files.filter(f => f.endsWith('.parquet') && !f.startsWith('backup_'))
        )
      };

      const manifestPath = path.join(this.indexDir, 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      logger.info('Created manifest file', {
        path: manifestPath,
        uploaded: stats.uploaded_papers,
        total: stats.total_papers
      });

    } catch (error) {
      logger.error('Failed to create manifest', { error });
      throw error;
    } finally {
      conn.close();
      db.close();
    }
  }
}