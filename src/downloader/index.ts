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
  private currentDelay: number = 1000; // Start with 1 second
  private consecutiveSuccesses: number = 0;
  private consecutiveFailures: number = 0;

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

  private async getDownloadPath(paper: ArxivPaper): Promise<string> {
    const category = paper.categories[0]?.split('.')[0] || 'misc';
    const categoryDir = path.join(this.downloadDir, category);

    // Ensure category directory exists
    await fs.mkdir(categoryDir, { recursive: true });

    const filename = `${paper.id.replace('/', '_')}_v${paper.version}.pdf`;
    return path.join(categoryDir, filename);
  }

  async downloadPdf(paper: ArxivPaper): Promise<string> {
    return this.limiter(async () => {
      const downloadPath = await this.getDownloadPath(paper);

      try {
        await fs.access(downloadPath);
        logger.info(`PDF already exists: ${downloadPath}`);
        return downloadPath;
      } catch {
      }

      return pRetry(
        async () => {
          logger.info(`Downloading PDF: ${paper.id} v${paper.version}`);

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

                // Track success and adjust delay
                this.consecutiveSuccesses++;
                this.consecutiveFailures = 0;

                // If we've had 10 successful downloads, try speeding up
                if (this.consecutiveSuccesses >= 10 && this.currentDelay > 500) {
                  this.currentDelay = Math.max(500, this.currentDelay - 200);
                  logger.info(`Reducing delay to ${this.currentDelay}ms after ${this.consecutiveSuccesses} successes`);
                }

                // Add adaptive delay between downloads
                await new Promise(resolve => setTimeout(resolve, this.currentDelay));

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
            logger.warn(`Download failed for ${paper.id}, attempt ${error.attemptNumber}/${DEFAULT_RATE_LIMIT.retryAttempts}`, {
              error: error.message
            });

            // If we hit rate limit (reCAPTCHA), back off significantly
            if (error.message.includes('reCAPTCHA') || error.message.includes('rate limit')) {
              this.consecutiveFailures++;
              this.consecutiveSuccesses = 0;
              this.currentDelay = Math.min(10000, this.currentDelay * 2); // Double delay, max 10s
              logger.warn(`Rate limit detected! Increasing delay to ${this.currentDelay}ms`);
            }
          }
        }
      );
    });
  }

  async downloadBatch(papers: ArxivPaper[]): Promise<Map<string, { success: boolean; path?: string; error?: string }>> {
    const results = new Map<string, { success: boolean; path?: string; error?: string }>();

    await this.ensureDownloadDirectory();

    await Promise.all(
      papers.map(async (paper) => {
        try {
          const path = await this.downloadPdf(paper);
          results.set(paper.id, { success: true, path });
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
      const downloadPath = await this.getDownloadPath(paper);
      await fs.access(downloadPath);
      return true;
    } catch {
      return false;
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