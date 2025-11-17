import { Database } from '../database';
import { TurboUploader } from './turboUploader';
import { ArnsManager } from './arnsManager';
// ParquetUpdater removed - Parquet files are re-exported from SQLite after uploads
import logger from '../utils/logger';
import fs from 'fs/promises';

export interface BatchUploadOptions {
  batchSize?: number;
  maxRetries?: number;
  delayBetweenBatches?: number;
  dryRun?: boolean;
  updateArns?: boolean;
}

export class BatchProcessor {
  private db: Database;
  private uploader: TurboUploader;
  private arnsManager: ArnsManager | null;

  constructor(
    walletPath: string = './wallet.json',
    dbPath?: string,
    _indexDir?: string,
    enableArns: boolean = true
  ) {
    this.db = new Database(dbPath);
    this.uploader = new TurboUploader(walletPath);
    this.arnsManager = enableArns ? new ArnsManager(walletPath) : null;
    // Parquet files are re-exported after uploads, not updated directly
  }

  async initialize(): Promise<void> {
    await this.db.initialize();
    await this.uploader.initialize();
  }

  /**
   * Update ArNS data index after parquet export and upload
   */
  async updateDataIndex(parquetTxId: string, undername: string = '@'): Promise<void> {
    if (!this.arnsManager) {
      logger.warn('ArNS manager not enabled, skipping data index update');
      return;
    }

    logger.info('Updating data_arxiv ArNS record with new parquet file', {
      transactionId: parquetTxId,
      undername
    });

    const result = await this.arnsManager.updateDataIndex(parquetTxId, undername);

    if (result.success) {
      logger.info('✅ data_arxiv updated successfully', { messageId: result.messageId });
    } else {
      logger.error('❌ Failed to update data_arxiv', { error: result.error });
      throw new Error(`ArNS update failed: ${result.error}`);
    }
  }

  async processBatch(options: BatchUploadOptions = {}): Promise<void> {
    const {
      batchSize = 10,
      delayBetweenBatches = 1000,
      dryRun = false
    } = options;

    try {
      // Get papers ready for upload
      const papers = await this.db.getReadyForUpload(batchSize);

      if (papers.length === 0) {
        logger.info('No papers ready for upload');
        return;
      }

      logger.info(`Processing batch of ${papers.length} papers for upload`);

      // Check balance before starting
      const balance = await this.uploader.checkBalance();
      logger.info(`Current balance: ${balance.winc} winc (${balance.ar} AR)`);

      // Estimate costs
      let totalSize = 0;
      for (const paper of papers) {
        if (paper.download_path) {
          const stats = await fs.stat(paper.download_path);
          totalSize += stats.size;
        }
      }

      const estimatedCost = await this.uploader.getUploadCost(totalSize);
      logger.info(`Estimated cost for batch: ${estimatedCost.winc} winc (${estimatedCost.ar} AR)`);

      if (dryRun) {
        logger.info('Dry run mode - skipping actual upload');
        return;
      }

      // Prepare papers for upload
      const uploadQueue: any[] = [];
      for (const paper of papers) {
        if (!paper.download_path) {
          logger.warn(`Paper ${paper.id} has no download path, skipping`);
          continue;
        }

        // Normalize path separators for cross-platform compatibility
        const normalizedPath = paper.download_path.replace(/\\/g, '/');

        // Check if file exists
        try {
          await fs.access(normalizedPath);
        } catch {
          logger.error(`File not found for paper ${paper.id}: ${normalizedPath}`);
          await this.db.markUploadError(paper.id, 'File not found');
          continue;
        }

        uploadQueue.push({
          paperId: paper.id,
          filePath: normalizedPath,
          metadata: {
            title: paper.title,
            authors: paper.authors,
            categories: paper.categories,
            published: paper.published,
            abstract: paper.summary
          }
        });
      }

      // Upload batch
      const results = await this.uploader.uploadBatch(
        uploadQueue,
        (current, total, paperId) => {
          logger.info(`Uploading ${current}/${total}: ${paperId}`);
        }
      );

      // Update database with transaction IDs
      for (const [paperId, result] of results) {
        await this.db.markAsUploaded(paperId, result.id);

        logger.info(`Paper ${paperId} uploaded successfully`, {
          transactionId: result.id,
          dataCaches: result.dataCaches
        });
      }

      // Note: Parquet files will be re-exported after all uploads complete
      // They are read-only exports from SQLite, not updated directly

      // Get upload stats
      const stats = await this.db.getUploadStats();
      logger.info('Upload batch completed', {
        uploaded: results.size,
        totalUploaded: stats.uploaded,
        pending: stats.pending_upload,
        failed: stats.failed_upload
      });

      // Process next batch if there are more papers
      if (stats.pending_upload > 0) {
        logger.info(`Waiting ${delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        await this.processBatch(options);
      }

    } catch (error) {
      logger.error('Batch processing failed', { error });
      throw error;
    }
  }

  async processAll(options: BatchUploadOptions = {}): Promise<void> {
    logger.info('Starting full upload process');

    // Keep processing batches until all are uploaded
    let hasMore = true;
    let totalUploaded = 0;

    while (hasMore) {
      try {
        const stats = await this.db.getUploadStats();

        if (stats.pending_upload === 0) {
          hasMore = false;
          logger.info('All papers uploaded successfully', {
            total: stats.uploaded
          });
          break;
        }

        logger.info(`Processing next batch (${stats.pending_upload} papers remaining)`);
        await this.processBatch(options);

        totalUploaded = stats.uploaded;

      } catch (error) {
        logger.error('Error in upload process', { error });

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    // Note: Manifest creation now happens during deployment after Parquet export

    logger.info('Upload process completed', {
      totalUploaded
    });
  }

  async verifyUploads(): Promise<void> {
    logger.info('Verifying uploaded papers...');

    // Get uploaded papers directly from database with transaction IDs
    const uploadedPapers = await this.db.getUploadedPapers();

    let verified = 0;
    let failed = 0;

    for (const paper of uploadedPapers) {
      if (paper.transaction_id) {
        const isValid = await this.uploader.verifyUpload(paper.transaction_id);

        if (isValid) {
          verified++;
        } else {
          failed++;
          logger.warn(`Transaction not found for paper ${paper.id}: ${paper.transaction_id}`);
        }
      }
    }

    logger.info('Verification completed', {
      total: uploadedPapers.length,
      verified,
      failed
    });
  }

  async getUploadStatus(): Promise<any> {
    const dbStats = await this.db.getUploadStats();
    // Parquet stats are checked directly from exported files during deployment
    const balance = await this.uploader.checkBalance();

    return {
      database: dbStats,
      // Parquet stats are checked from exported files during deployment
      balance,
      timestamp: new Date().toISOString()
    };
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}