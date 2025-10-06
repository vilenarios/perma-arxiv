import { TurboFactory, TurboAuthenticatedClient } from '@ardrive/turbo-sdk';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger';

export interface UploadOptions {
  dataItemOpts?: {
    tags?: { name: string; value: string }[];
  };
  signal?: AbortSignal;
}

export interface UploadResult {
  id: string;
  dataCaches: string[];
  fastFinalityIndexes: string[];
  owner: string;
  dataItemId?: string;
  winc?: string;
}

export class TurboUploader {
  private turbo: TurboAuthenticatedClient | null = null;
  private walletPath: string;

  constructor(walletPath: string = './wallet.json') {
    this.walletPath = walletPath;
  }

  async initialize(): Promise<void> {
    try {
      // Check if wallet file exists
      await fs.access(this.walletPath);

      // Load wallet (JWK format)
      const jwk = JSON.parse(await fs.readFile(this.walletPath, 'utf-8'));

      // Initialize Turbo client
      this.turbo = TurboFactory.authenticated({
        privateKey: jwk,
      });

      logger.info('Turbo SDK initialized successfully');

      // Check balance
      const balance = await this.turbo.getBalance();
      logger.info(`Turbo balance: ${balance.winc} winc`);
    } catch (error) {
      logger.error('Failed to initialize Turbo SDK', { error });
      throw error;
    }
  }

  async uploadPaper(
    filePath: string,
    paperId: string,
    metadata: {
      title: string;
      authors: string;
      categories: string;
      published: string;
      abstract?: string;
    }
  ): Promise<UploadResult> {
    if (!this.turbo) {
      await this.initialize();
    }

    try {
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);

      logger.info(`File loaded: ${fileName}, size: ${fileBuffer.length} bytes`);

      // Prepare tags - total must be under 4096 bytes
      const tags: { name: string; value: string }[] = [
        { name: 'Content-Type', value: 'application/pdf' },
        { name: 'App-Name', value: 'arxiv-scraper' },
        { name: 'ArXiv-ID', value: paperId },
        { name: 'Title', value: metadata.title.slice(0, 1024) }, // Reduced limit
        { name: 'Authors', value: metadata.authors.slice(0, 1024) }, // Reduced limit
        { name: 'Categories', value: metadata.categories },
        { name: 'Published', value: metadata.published },
        { name: 'File-Name', value: fileName }
      ];
      // Abstract removed - not needed and saves space

      // Upload using Turbo SDK
      logger.info(`Uploading paper ${paperId} to Arweave...`);

      const uploadResult = await this.turbo!.uploadFile({
        fileStreamFactory: () => fileBuffer,
        fileSizeFactory: () => fileBuffer.length,
        dataItemOpts: {
          tags
        }
      });

      const result: UploadResult = {
        id: uploadResult.id,
        dataCaches: uploadResult.dataCaches || [],
        fastFinalityIndexes: uploadResult.fastFinalityIndexes || [],
        owner: uploadResult.owner || '',
        dataItemId: uploadResult.id, // The ID is the data item ID
        winc: (uploadResult as any).winc
      };

      logger.info(`Successfully uploaded paper ${paperId}`, {
        transactionId: result.id,
        dataCaches: result.dataCaches
      });

      return result;
    } catch (error: any) {
      logger.error(`Failed to upload paper ${paperId}`, {
        error: error.message || error,
        stack: error.stack,
        paperId,
        filePath
      });
      throw error;
    }
  }

  async uploadBatch(
    papers: Array<{
      paperId: string;
      filePath: string;
      metadata: {
        title: string;
        authors: string;
        categories: string;
        published: string;
        abstract?: string;
      };
    }>,
    onProgress?: (current: number, total: number, paperId: string) => void
  ): Promise<Map<string, UploadResult>> {
    const results = new Map<string, UploadResult>();
    const total = papers.length;

    for (let i = 0; i < papers.length; i++) {
      const paper = papers[i];

      try {
        if (onProgress) {
          onProgress(i + 1, total, paper.paperId);
        }

        const result = await this.uploadPaper(
          paper.filePath,
          paper.paperId,
          paper.metadata
        );

        results.set(paper.paperId, result);

        // Small delay between uploads to avoid rate limits
        if (i < papers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error: any) {
        logger.error(`Failed to upload paper ${paper.paperId} in batch`, {
          error: error.message || error,
          stack: error.stack,
          paperId: paper.paperId,
          filePath: paper.filePath
        });
        // Continue with next paper
      }
    }

    return results;
  }

  async checkBalance(): Promise<{ winc: string; ar: string }> {
    if (!this.turbo) {
      await this.initialize();
    }

    const balance = await this.turbo!.getBalance();

    // Convert winc to AR (1 AR = 1e12 winc)
    const arBalance = (BigInt(balance.winc) / BigInt(1e12)).toString();

    return {
      winc: balance.winc,
      ar: arBalance
    };
  }

  async getUploadCost(sizeInBytes: number): Promise<{ winc: string; ar: string }> {
    if (!this.turbo) {
      await this.initialize();
    }

    const [{ winc }] = await this.turbo!.getUploadCosts({
      bytes: [sizeInBytes]
    });

    // Convert winc to AR
    const arCost = (BigInt(winc) / BigInt(1e12)).toString();

    return {
      winc,
      ar: arCost
    };
  }

  async verifyUpload(transactionId: string): Promise<boolean> {
    try {
      // Check if transaction exists on gateway
      const response = await fetch(`https://arweave.net/${transactionId}`, {
        method: 'HEAD'
      });

      return response.ok;
    } catch (error) {
      logger.error(`Failed to verify transaction ${transactionId}`, { error });
      return false;
    }
  }
}