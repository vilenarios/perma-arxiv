import { ArxivClient } from '../api/arxivClient';
import { Database } from '../database';
import { PdfDownloader } from '../downloader';
import { ArxivPaper } from '../types';
import { BATCH_SIZE, CATEGORIES } from '../config';
import logger from '../utils/logger';

export interface ScraperOptions {
  categories?: string[];
  startDate?: string;
  endDate?: string;
  maxPapers?: number;
  downloadPdfs?: boolean;
  incrementalOnly?: boolean;
}

export class ArxivScraper {
  private client: ArxivClient;
  private db: Database;
  private downloader: PdfDownloader;

  constructor() {
    this.client = new ArxivClient();
    this.db = new Database();
    this.downloader = new PdfDownloader();
  }

  async initialize(): Promise<void> {
    await this.db.initialize();
    await this.downloader.ensureDownloadDirectory();
  }

  async scrapeCategory(category: string, options: ScraperOptions = {}): Promise<void> {
    logger.info(`Starting scrape for category: ${category}`);

    let start = 0;
    let totalProcessed = 0;
    let totalDownloaded = 0;
    let totalFailed = 0;
    const maxPapers = options.maxPapers || Infinity;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;

    let latestDate: string | null = null;
    if (options.incrementalOnly) {
      latestDate = await this.db.getLatestUpdateDate(category);
      if (latestDate) {
        logger.info(`Incremental sync from date: ${latestDate}`);
      }
    }

    while (totalProcessed < maxPapers) {
      try {
        const batchSize = Math.min(BATCH_SIZE, maxPapers - totalProcessed);

        let result;
        if (options.startDate && options.endDate) {
          result = await this.client.searchByDateRange(
            options.startDate,
            options.endDate,
            start,
            batchSize
          );
        } else {
          result = await this.client.searchByCategory(category, start, batchSize);
        }

        if (result.papers.length === 0) {
          logger.info('No more papers to process');
          break;
        }

        let papersToProcess = result.papers;

        if (latestDate) {
          papersToProcess = papersToProcess.filter(paper => {
            return new Date(paper.updated) > new Date(latestDate);
          });

          if (papersToProcess.length === 0) {
            logger.info('No new papers since last sync');
            break;
          }
        }

        // Use batch transaction for atomic operation
        if (papersToProcess.length > 0) {
          await this.db.upsertPaperBatch(papersToProcess);
          totalProcessed += papersToProcess.length;
        }

        logger.info(`Processed ${papersToProcess.length} papers (Total: ${totalProcessed}/${result.totalResults})`);

        if (options.downloadPdfs) {
          const toDownload: ArxivPaper[] = [];
          for (const paper of papersToProcess) {
            const exists = await this.downloader.checkExisting(paper);
            if (!exists) {
              toDownload.push(paper);
            }
          }

          if (toDownload.length > 0) {
            logger.info(`Downloading ${toDownload.length} PDFs...`);
            const downloadResults = await this.downloader.downloadBatch(toDownload);

            for (const [paperId, result] of downloadResults) {
              if (result.success && result.path) {
                await this.db.markAsDownloaded(paperId, result.path, result.format || 'pdf');
                totalDownloaded++;
              } else if (result.error) {
                await this.db.markAsError(paperId, result.error);
                totalFailed++;
              }
            }
          }
        }

        start += batchSize;

        if (result.papers.length < batchSize) {
          logger.info('Reached end of results');
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Reset failure counter on successful batch
        consecutiveFailures = 0;

      } catch (error) {
        consecutiveFailures++;
        logger.error('Error in scraping batch', {
          error,
          start,
          category,
          consecutiveFailures,
          totalProcessed
        });

        // If we haven't processed anything yet, fail immediately
        if (totalProcessed === 0) {
          throw error;
        }

        // If too many consecutive failures, stop scraping this category
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.error(`Too many consecutive failures (${consecutiveFailures}), stopping scrape for ${category}`);
          break;
        }

        // Otherwise, continue to next batch after delay
        logger.warn(`Continuing to next batch after failure (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        start += BATCH_SIZE;
      }
    }

    await this.db.updateSyncStatus(category, totalProcessed, totalDownloaded, totalFailed);

    logger.info(`Scraping completed for ${category}`, {
      totalProcessed,
      totalDownloaded,
      totalFailed
    });
  }

  async scrapeAll(options: ScraperOptions = {}): Promise<void> {
    const categories = options.categories || CATEGORIES;
    const checkpointName = 'scrape-all';

    logger.info(`Starting full scrape for ${categories.length} categories`);

    // Check for existing checkpoint
    const checkpoint = await this.db.loadCheckpoint(checkpointName);
    let startIndex = 0;

    if (checkpoint?.lastCompletedCategory) {
      startIndex = categories.indexOf(checkpoint.lastCompletedCategory) + 1;
      if (startIndex > 0 && startIndex < categories.length) {
        logger.info(`📍 Resuming from checkpoint: ${categories[startIndex]} (skipped ${startIndex} completed categories)`);
      } else {
        startIndex = 0; // Invalid checkpoint, start from beginning
      }
    }

    for (let i = startIndex; i < categories.length; i++) {
      const category = categories[i];
      try {
        await this.scrapeCategory(category, options);
        // Save checkpoint after each successful category
        await this.db.saveCheckpoint(checkpointName, {
          lastCompletedCategory: category
        });
      } catch (error) {
        logger.error(`Failed to scrape category ${category}`, { error });
      }
    }

    // Clear checkpoint after successful completion
    await this.db.clearCheckpoint(checkpointName);
    logger.info('✅ All categories completed, checkpoint cleared');
  }

  async downloadMissingPdfs(limit: number = 100): Promise<void> {
    logger.info('Downloading missing PDFs...');

    const papers = await this.db.getUndownloadedPapers(limit);

    if (papers.length === 0) {
      logger.info('No missing PDFs to download');
      return;
    }

    logger.info(`Found ${papers.length} papers to download`);
    logger.info('Starting downloads (HTML preferred, PDF fallback)...');

    const downloadResults = await this.downloader.downloadBatch(papers);

    let successCount = 0;
    let failureCount = 0;
    let htmlCount = 0;
    let pdfCount = 0;

    for (const [paperId, result] of downloadResults) {
      if (result.success && result.path) {
        await this.db.markAsDownloaded(paperId, result.path, result.format || 'pdf');
        successCount++;
        if (result.format === 'html') {
          htmlCount++;
        } else {
          pdfCount++;
        }
      } else if (result.error) {
        await this.db.markAsError(paperId, result.error);
        failureCount++;
      }
    }

    logger.info(`Download completed: ${successCount} successful (${htmlCount} HTML, ${pdfCount} PDF), ${failureCount} failed`);
  }

  async incrementalSync(options: ScraperOptions = {}): Promise<void> {
    logger.info('Starting incremental sync...');

    const syncOptions = {
      ...options,
      incrementalOnly: true,
      downloadPdfs: options.downloadPdfs !== false
    };

    await this.scrapeAll(syncOptions);
  }

  async getStatistics(): Promise<any> {
    const dbStats = await this.db.getStats();
    const downloadStats = await this.downloader.getDownloadStats();

    return {
      database: dbStats,
      downloads: {
        ...downloadStats,
        totalSizeGB: (downloadStats.totalSize / (1024 * 1024 * 1024)).toFixed(2)
      }
    };
  }

  async searchPapers(query: string, limit: number = 10): Promise<ArxivPaper[]> {
    const result = await this.client.search({
      searchQuery: query,
      maxResults: limit,
      sortBy: 'relevance'
    });

    for (const paper of result.papers) {
      await this.db.upsertPaper(paper);
    }

    return result.papers;
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}