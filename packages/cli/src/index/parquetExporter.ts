import * as duckdb from 'duckdb';
const parquet = require('parquetjs');
import path from 'path';
import fs from 'fs/promises';
import { Database } from '../database';
import { ParquetPaperRecord, IndexMetadata } from './types';
import logger from '../utils/logger';

const SCHEMA_VERSION = 2; // Increment when schema changes

export class ParquetExporter {
  private db: Database;
  private duckDb: duckdb.Database;
  private indexDir: string;

  constructor(indexDir: string = './data/parquet') {
    this.db = new Database();
    this.duckDb = new duckdb.Database(':memory:');
    this.indexDir = indexDir;
  }

  async initialize(): Promise<void> {
    await this.db.initialize();
    await fs.mkdir(this.indexDir, { recursive: true });
  }

  /**
   * Export to Parquet and upload to Arweave, optionally updating ArNS
   */
  async exportAndUpload(
    uploadToArweave: boolean = false,
    updateArns: boolean = false,
    walletPath?: string
  ): Promise<{ files: string[]; transactionId?: string }> {
    // Export to parquet
    const files = await this.exportToParquet();

    logger.info(`Exported ${files.length} parquet files`);

    // If upload is not requested, just return the files
    if (!uploadToArweave) {
      return { files };
    }

    // Upload the main index file to Arweave
    const { TurboUploader } = await import('../arweave/turboUploader');
    const uploader = new TurboUploader(walletPath || process.env.ARWEAVE_WALLET_PATH || './wallet.json');
    await uploader.initialize();

    const mainIndexFile = files[0]; // Assuming first file is main index
    logger.info(`Uploading main parquet file to Arweave: ${mainIndexFile}`);

    const uploadResult = await uploader.uploadPaper(
      mainIndexFile,
      'parquet-index',
      {
        title: 'ArXiv Parquet Index',
        authors: 'PermaArxiv',
        categories: 'data',
        published: new Date().toISOString()
      }
    );

    if (uploadResult && uploadResult.id) {
      logger.info('✅ Parquet index uploaded to Arweave', { txId: uploadResult.id });

      // Update ArNS if requested
      if (updateArns) {
        const { ArnsManager } = await import('../arweave/arnsManager');
        const arnsManager = new ArnsManager(walletPath || process.env.ARWEAVE_WALLET_PATH || './wallet.json');

        logger.info('Updating data_arxiv ArNS record...');
        const arnsResult = await arnsManager.updateDataIndex(uploadResult.id, 'data');

        if (arnsResult.success) {
          logger.info('✅ data_arxiv ArNS record updated', { messageId: arnsResult.messageId });
        } else {
          logger.error('❌ Failed to update data_arxiv ArNS', { error: arnsResult.error });
        }
      }

      return {
        files,
        transactionId: uploadResult.id
      };
    } else {
      throw new Error('Failed to upload parquet index to Arweave');
    }
  }

  private async createParquetSchema(): Promise<any> {
    return new parquet.ParquetSchema({
      _schema_version: { type: 'INT32' }, // Add schema version field
      id: { type: 'UTF8', compression: 'SNAPPY' },
      version: { type: 'INT32' },
      updated: { type: 'TIMESTAMP_MILLIS' },
      published: { type: 'TIMESTAMP_MILLIS' },
      year: { type: 'INT32' },
      month: { type: 'INT32' },
      title: { type: 'UTF8', compression: 'SNAPPY' },
      summary: { type: 'UTF8', compression: 'SNAPPY' },
      authors: { type: 'UTF8', compression: 'SNAPPY' },
      author_count: { type: 'INT32' },
      primary_category: { type: 'UTF8', compression: 'SNAPPY' },
      all_categories: { type: 'UTF8', compression: 'SNAPPY' },
      category_count: { type: 'INT32' },
      pdf_url: { type: 'UTF8' },
      html_url: { type: 'UTF8' },
      abstract_url: { type: 'UTF8' },
      comment: { type: 'UTF8', optional: true, compression: 'SNAPPY' },
      journal_ref: { type: 'UTF8', optional: true },
      doi: { type: 'UTF8', optional: true },
      license: { type: 'UTF8', optional: true },
      downloaded: { type: 'BOOLEAN' },
      download_format: { type: 'UTF8', optional: true },
      download_path: { type: 'UTF8', optional: true },
      download_date: { type: 'TIMESTAMP_MILLIS', optional: true },
      file_size_mb: { type: 'FLOAT', optional: true },
      word_count: { type: 'INT32', optional: true },
      transaction_id: { type: 'UTF8', optional: true },
      upload_date: { type: 'TIMESTAMP_MILLIS', optional: true }
    });
  }

  async exportToParquet(batchSize: number = 10000): Promise<string[]> {
    logger.info('Starting Parquet export...');

    const schema = await this.createParquetSchema();
    const parquetFiles: string[] = [];
    let offset = 0;
    let batchNum = 0;

    while (true) {
      const papers = await this.getPapersBatch(offset, batchSize);

      if (papers.length === 0) break;

      const filename = `arxiv_index_${batchNum}.parquet`;
      const filepath = path.join(this.indexDir, filename);

      const writer = await parquet.ParquetWriter.openFile(schema, filepath);

      for (const paper of papers) {
        await writer.appendRow(paper);
      }

      await writer.close();
      parquetFiles.push(filepath);

      logger.info(`Exported batch ${batchNum} with ${papers.length} papers to ${filename}`);

      offset += batchSize;
      batchNum++;
    }

    await this.createMetadataFile(parquetFiles);

    logger.info(`Export completed. Created ${parquetFiles.length} Parquet files`);
    return parquetFiles;
  }

  private async getPapersBatch(offset: number, limit: number): Promise<ParquetPaperRecord[]> {
    return new Promise((resolve, reject) => {
      this.db['db'].all(
        `SELECT
          p.*,
          CASE WHEN p.download_path IS NOT NULL THEN 1 ELSE 0 END as file_exists
        FROM papers p
        ORDER BY p.updated DESC
        LIMIT ? OFFSET ?`,
        [limit, offset],
        async (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }

          const records: ParquetPaperRecord[] = [];

          for (const row of rows) {
            const authors = JSON.parse(row.authors || '[]');
            const categories = JSON.parse(row.categories || '[]');

            let fileSizeMb: number | undefined;
            if (row.download_path && row.file_exists) {
              try {
                const stats = await fs.stat(row.download_path);
                fileSizeMb = stats.size / (1024 * 1024);
              } catch {}
            }

            const publishedDate = new Date(row.published);

            records.push({
              _schema_version: SCHEMA_VERSION,
              id: row.id,
              version: row.version,
              updated: new Date(row.updated),
              published: publishedDate,
              year: publishedDate.getFullYear(),
              month: publishedDate.getMonth() + 1,
              title: row.title,
              summary: row.summary || '',
              authors: authors.join('; '),
              author_count: authors.length,
              primary_category: categories[0] || '',
              all_categories: categories.join(', '),
              category_count: categories.length,
              pdf_url: row.pdf_url,
              html_url: row.html_url || '',
              abstract_url: row.abstract_url,
              comment: row.comment,
              journal_ref: row.journal_ref,
              doi: row.doi,
              license: row.license,
              downloaded: row.downloaded === 1,
              download_format: row.download_format,
              download_path: row.download_path,
              download_date: row.download_date ? new Date(row.download_date) : undefined,
              file_size_mb: fileSizeMb,
              word_count: row.summary ? row.summary.split(/\s+/).length : undefined,
              transaction_id: row.transaction_id,
              upload_date: row.upload_date ? new Date(row.upload_date) : undefined
            });
          }

          resolve(records);
        }
      );
    });
  }

  async createMetadataFile(parquetFiles: string[]): Promise<void> {
    const stats = await this.db.getStats();

    const categoriesResult: string[] = await new Promise((resolve, reject) => {
      this.db['db'].all(
        `SELECT DISTINCT categories FROM papers`,
        [],
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const allCategories = new Set<string>();
            rows.forEach(row => {
              const cats = JSON.parse(row.categories || '[]');
              cats.forEach((c: string) => allCategories.add(c));
            });
            resolve(Array.from(allCategories));
          }
        }
      );
    });

    const dateRange = await new Promise<{ earliest: Date; latest: Date }>((resolve, reject) => {
      this.db['db'].get(
        `SELECT MIN(published) as earliest, MAX(published) as latest FROM papers`,
        [],
        (err, row: any) => {
          if (err) reject(err);
          else resolve({
            earliest: new Date(row.earliest),
            latest: new Date(row.latest)
          });
        }
      );
    });

    let totalSizeGb = 0;
    for (const file of parquetFiles) {
      const stats = await fs.stat(file);
      totalSizeGb += stats.size / (1024 * 1024 * 1024);
    }

    const metadata: IndexMetadata = {
      created_at: new Date(),
      updated_at: new Date(),
      total_papers: stats.total_papers,
      total_size_gb: totalSizeGb,
      categories: categoriesResult,
      date_range: dateRange,
      version: '1.0.0',
      parquet_files: parquetFiles.map(f => path.basename(f))
    };

    await fs.writeFile(
      path.join(this.indexDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    logger.info('Metadata file created');
  }

  async createPartitionedExport(): Promise<void> {
    logger.info('Creating partitioned Parquet export by category...');

    const categories = await this.getCategories();

    for (const category of categories) {
      const categoryDir = path.join(this.indexDir, 'partitioned', category.replace('.', '_'));
      await fs.mkdir(categoryDir, { recursive: true });

      const papers = await this.getPapersByCategory(category);

      if (papers.length === 0) continue;

      const schema = await this.createParquetSchema();
      const filename = `${category.replace('.', '_')}.parquet`;
      const filepath = path.join(categoryDir, filename);

      const writer = await parquet.ParquetWriter.openFile(schema, filepath);

      for (const paper of papers) {
        await writer.appendRow(paper);
      }

      await writer.close();

      logger.info(`Exported ${papers.length} papers for category ${category}`);
    }
  }

  private async getCategories(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.db['db'].all(
        `SELECT DISTINCT categories FROM papers`,
        [],
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const categories = new Set<string>();
            rows.forEach(row => {
              const cats = JSON.parse(row.categories || '[]');
              cats.forEach((c: string) => categories.add(c.split('.')[0]));
            });
            resolve(Array.from(categories));
          }
        }
      );
    });
  }

  private async getPapersByCategory(category: string): Promise<ParquetPaperRecord[]> {
    return new Promise((resolve, reject) => {
      this.db['db'].all(
        `SELECT * FROM papers WHERE categories LIKE ?`,
        [`%"${category}%`],
        async (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }

          const records: ParquetPaperRecord[] = [];

          for (const row of rows) {
            const authors = JSON.parse(row.authors || '[]');
            const categories = JSON.parse(row.categories || '[]');
            const publishedDate = new Date(row.published);

            records.push({
              _schema_version: SCHEMA_VERSION,
              id: row.id,
              version: row.version,
              updated: new Date(row.updated),
              published: publishedDate,
              year: publishedDate.getFullYear(),
              month: publishedDate.getMonth() + 1,
              title: row.title,
              summary: row.summary || '',
              authors: authors.join('; '),
              author_count: authors.length,
              primary_category: categories[0] || '',
              all_categories: categories.join(', '),
              category_count: categories.length,
              pdf_url: row.pdf_url,
              html_url: row.html_url || '',
              abstract_url: row.abstract_url,
              comment: row.comment,
              journal_ref: row.journal_ref,
              doi: row.doi,
              license: row.license,
              downloaded: row.downloaded === 1,
              download_format: row.download_format,
              download_path: row.download_path,
              download_date: row.download_date ? new Date(row.download_date) : undefined,
              transaction_id: row.transaction_id,
              upload_date: row.upload_date ? new Date(row.upload_date) : undefined
            });
          }

          resolve(records);
        }
      );
    });
  }

  async close(): Promise<void> {
    await this.db.close();
    this.duckDb.close();
  }
}