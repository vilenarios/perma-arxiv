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

        for (const paper of papersToProcess) {
          await this.db.upsertPaper(paper);
          totalProcessed++;
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
                await this.db.markAsDownloaded(paperId, result.path);
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

      } catch (error) {
        logger.error('Error in scraping batch', { error, start, category });

        if (totalProcessed === 0) {
          throw error;
        }
        break;
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

    logger.info(`Starting full scrape for ${categories.length} categories`);

    for (const category of categories) {
      try {
        await this.scrapeCategory(category, options);
      } catch (error) {
        logger.error(`Failed to scrape category ${category}`, { error });
      }
    }
  }

  async downloadMissingPdfs(limit: number = 100): Promise<void> {
    logger.info('Downloading missing PDFs...');

    const papers = await this.db.getUndownloadedPapers(limit);

    if (papers.length === 0) {
      logger.info('No missing PDFs to download');
      return;
    }

    logger.info(`Found ${papers.length} papers to download`);

    const downloadResults = await this.downloader.downloadBatch(papers);

    let successCount = 0;
    let failureCount = 0;

    for (const [paperId, result] of downloadResults) {
      if (result.success && result.path) {
        await this.db.markAsDownloaded(paperId, result.path);
        successCount++;
      } else if (result.error) {
        await this.db.markAsError(paperId, result.error);
        failureCount++;
      }
    }

    logger.info(`Download completed: ${successCount} successful, ${failureCount} failed`);
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