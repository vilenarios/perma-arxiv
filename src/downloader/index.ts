import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { ArxivPaper } from '../types';
import { DOWNLOAD_DIR, DEFAULT_RATE_LIMIT, USER_AGENT } from '../config';
import logger from '../utils/logger';

export class PdfDownloader {
  private limiter: ReturnType<typeof pLimit>;
  private downloadDir: string;
  private currentDelay: number = 250; // Base delay: 250ms (4 req/sec burst mode for export.arxiv.org)
  private consecutiveSuccesses: number = 0;
  private consecutiveFailures: number = 0;
  private requestsInBurst: number = 0;
  private readonly BURST_SIZE = 4; // 4 requests per burst
  private readonly BURST_SLEEP = 1000; // 1 second sleep after burst

  private async getDelayWithBurst(): Promise<void> {
    this.requestsInBurst++;

    // After 4 requests, take a 1 second sleep
    if (this.requestsInBurst >= this.BURST_SIZE) {
      logger.debug(`Burst complete (${this.BURST_SIZE} requests), sleeping ${this.BURST_SLEEP}ms`);
      await new Promise(resolve => setTimeout(resolve, this.BURST_SLEEP));
      this.requestsInBurst = 0;
    } else {
      // Small delay between requests in burst
      await new Promise(resolve => setTimeout(resolve, this.currentDelay));
    }
  }

  constructor(downloadDir: string = DOWNLOAD_DIR, maxConcurrent: number = 1) {
    this.downloadDir = downloadDir;
    this.limiter = pLimit(maxConcurrent);
  }

  async ensureDownloadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.downloadDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create download directory', { error });
      throw error;
    }
  }

  private async getDownloadPath(paper: ArxivPaper, format: 'html' | 'pdf'): Promise<string> {
    const category = paper.categories[0]?.split('.')[0] || 'misc';
    const categoryDir = path.join(this.downloadDir, category);

    // Ensure category directory exists
    await fs.mkdir(categoryDir, { recursive: true });

    const extension = format === 'html' ? '.html' : '.pdf';
    const filename = `${paper.id.replace('/', '_')}_v${paper.version}${extension}`;
    return path.join(categoryDir, filename);
  }


  async download(paper: ArxivPaper): Promise<{ path: string; format: 'html' | 'pdf' }> {
    return this.limiter(async () => {
      // Try HTML first (no HEAD request - just try to download)
      try {
        const htmlPath = await this.downloadHtml(paper);
        return { path: htmlPath, format: 'html' };
      } catch (error: any) {
        // If HTML fails with 404, it's not available - try PDF
        // If it's 403, we're rate limited - still try PDF as fallback
        const is404 = error.response?.status === 404 || error.message?.includes('404');
        const is403 = error.response?.status === 403 || error.message?.includes('403');

        if (is404) {
          logger.debug(`HTML not available for ${paper.id}, using PDF`);
        } else if (is403) {
          logger.warn(`Rate limited on HTML for ${paper.id}, trying PDF`);
        } else {
          logger.warn(`HTML download failed for ${paper.id}: ${error.message}`);
        }
      }

      // Fallback to PDF
      const pdfPath = await this.downloadPdf(paper);
      return { path: pdfPath, format: 'pdf' };
    });
  }

  private async downloadHtml(paper: ArxivPaper): Promise<string> {
    const downloadPath = await this.getDownloadPath(paper, 'html');

    try {
      await fs.access(downloadPath);
      logger.info(`HTML already exists: ${downloadPath}`);
      return downloadPath;
    } catch {
    }

    return pRetry(
      async () => {
        logger.info(`Downloading HTML: ${paper.id} v${paper.version}`);

        // Apply burst delay BEFORE request
        await this.getDelayWithBurst();

        const response = await axios({
          method: 'GET',
          url: paper.htmlUrl,
          timeout: 60000,
          headers: {
            'User-Agent': USER_AGENT
          }
        });

        await fs.writeFile(downloadPath, response.data);
        logger.info(`Downloaded HTML: ${paper.id} -> ${downloadPath}`);

        // Track success
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;

        return downloadPath;
      },
      {
        retries: DEFAULT_RATE_LIMIT.retryAttempts,
        minTimeout: DEFAULT_RATE_LIMIT.retryDelay,
        onFailedAttempt: error => {
          // Don't retry on 404 - HTML version doesn't exist
          if (error.message.includes('404')) {
            throw error; // Abort retry
          }
          logger.warn(`HTML download failed for ${paper.id}, attempt ${error.attemptNumber}/${DEFAULT_RATE_LIMIT.retryAttempts}`, {
            error: error.message
          });
        }
      }
    );
  }

  private async downloadPdf(paper: ArxivPaper): Promise<string> {
    const downloadPath = await this.getDownloadPath(paper, 'pdf');

    try {
      await fs.access(downloadPath);
      logger.info(`PDF already exists: ${downloadPath}`);
      return downloadPath;
    } catch {
    }

    return pRetry(
      async () => {
        logger.info(`Downloading PDF: ${paper.id} v${paper.version}`);

        // Apply burst delay BEFORE request
        await this.getDelayWithBurst();

        const response = await axios({
          method: 'GET',
          url: paper.pdfUrl,
          responseType: 'stream',
          timeout: 60000,
          headers: {
            'User-Agent': USER_AGENT
          }
        });

        const tempPath = `${downloadPath}.tmp`;
        const writer = (await import('fs')).createWriteStream(tempPath);

        response.data.pipe(writer);

        return new Promise<string>((resolve, reject) => {
          writer.on('finish', async () => {
            try {
              // Validate the file is actually a PDF
              const fileBuffer = await fs.readFile(tempPath);
              const isPdf = fileBuffer.length > 100 &&
                           fileBuffer[0] === 0x25 &&
                           fileBuffer[1] === 0x50 &&
                           fileBuffer[2] === 0x44 &&
                           fileBuffer[3] === 0x46; // %PDF

              if (!isPdf) {
                await fs.unlink(tempPath).catch(() => {});
                const preview = fileBuffer.slice(0, 200).toString('utf-8');
                if (preview.includes('reCAPTCHA') || preview.includes('arXiv.org')) {
                  throw new Error(`ArXiv rate limit detected (reCAPTCHA). Please wait and retry later.`);
                }
                throw new Error(`Downloaded file is not a valid PDF. Got: ${preview.substring(0, 100)}`);
              }

              await fs.rename(tempPath, downloadPath);
              logger.info(`Downloaded: ${paper.id} -> ${downloadPath}`);

              // Track success
              this.consecutiveSuccesses++;
              this.consecutiveFailures = 0;

              resolve(downloadPath);
            } catch (error) {
              reject(error);
            }
          });

          writer.on('error', async (error) => {
            try {
              await fs.unlink(tempPath).catch(() => {});
            } catch {}
            reject(error);
          });

          response.data.on('error', async (error: any) => {
            writer.destroy();
            try {
              await fs.unlink(tempPath).catch(() => {});
            } catch {}
            reject(error);
          });
        });
      },
      {
        retries: DEFAULT_RATE_LIMIT.retryAttempts,
        minTimeout: DEFAULT_RATE_LIMIT.retryDelay,
        onFailedAttempt: error => {
          // Don't retry on 404 - PDF doesn't exist
          if (error.message.includes('404')) {
            throw error; // Abort retry immediately
          }

          logger.warn(`Download failed for ${paper.id}, attempt ${error.attemptNumber}/${DEFAULT_RATE_LIMIT.retryAttempts}`, {
            error: error.message
          });

          // If we hit rate limit (reCAPTCHA or 403), back off significantly
          if (error.message.includes('reCAPTCHA') || error.message.includes('rate limit') || error.message.includes('403')) {
            this.consecutiveFailures++;
            this.consecutiveSuccesses = 0;
            this.currentDelay = Math.min(10000, this.currentDelay * 2); // Double delay, max 10s
            logger.warn(`Rate limit/403 detected! Increasing delay to ${this.currentDelay}ms`);
          }
        }
      }
    );
  }

  async downloadBatch(papers: ArxivPaper[]): Promise<Map<string, { success: boolean; path?: string; format?: 'html' | 'pdf'; error?: string }>> {
    const results = new Map<string, { success: boolean; path?: string; format?: 'html' | 'pdf'; error?: string }>();

    await this.ensureDownloadDirectory();

    await Promise.all(
      papers.map(async (paper) => {
        try {
          const result = await this.download(paper);
          results.set(paper.id, { success: true, path: result.path, format: result.format });
        } catch (error) {
          logger.error(`Failed to download ${paper.id}`, { error });
          results.set(paper.id, {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    return results;
  }

  async checkExisting(paper: ArxivPaper): Promise<boolean> {
    try {
      // Check for HTML first
      const htmlPath = await this.getDownloadPath(paper, 'html');
      await fs.access(htmlPath);
      return true;
    } catch {
      try {
        // Fallback to PDF
        const pdfPath = await this.getDownloadPath(paper, 'pdf');
        await fs.access(pdfPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  async getDownloadStats(): Promise<{ totalFiles: number; totalSize: number }> {
    let totalFiles = 0;
    let totalSize = 0;

    async function walkDir(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.pdf')) {
          totalFiles++;
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        }
      }
    }

    try {
      await walkDir(this.downloadDir);
    } catch (error) {
      logger.error('Failed to get download stats', { error });
    }

    return { totalFiles, totalSize };
  }
}