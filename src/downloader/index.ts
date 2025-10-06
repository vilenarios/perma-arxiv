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

  constructor(downloadDir: string = DOWNLOAD_DIR, maxConcurrent: number = 2) {
    this.downloadDir = downloadDir;
    this.limiter = pLimit(maxConcurrent);
  }

  async ensureDownloadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.downloadDir, { recursive: true });

      const categories = ['cs', 'math', 'physics', 'q-bio', 'stat'];
      for (const category of categories) {
        await fs.mkdir(path.join(this.downloadDir, category), { recursive: true });
      }
    } catch (error) {
      logger.error('Failed to create download directory', { error });
      throw error;
    }
  }

  private getDownloadPath(paper: ArxivPaper): string {
    const category = paper.categories[0]?.split('.')[0] || 'misc';
    const filename = `${paper.id.replace('/', '_')}_v${paper.version}.pdf`;
    return path.join(this.downloadDir, category, filename);
  }

  async downloadPdf(paper: ArxivPaper): Promise<string> {
    return this.limiter(async () => {
      const downloadPath = this.getDownloadPath(paper);

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
                await fs.rename(tempPath, downloadPath);
                logger.info(`Downloaded: ${paper.id} -> ${downloadPath}`);
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
      const downloadPath = this.getDownloadPath(paper);
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