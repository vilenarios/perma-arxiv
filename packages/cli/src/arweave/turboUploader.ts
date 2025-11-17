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

      // Detect content type from file extension
      const fileExt = path.extname(filePath).toLowerCase();
      const contentType = fileExt === '.html' ? 'text/html' : 'application/pdf';

      // Prepare tags - total must be under 4096 bytes
      const tags: { name: string; value: string }[] = [
        { name: 'Content-Type', value: contentType },
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
    onProgress?: (current: number, total: number, paperId: string) => void,
    concurrency: number = 10
  ): Promise<Map<string, UploadResult>> {
    const results = new Map<string, UploadResult>();
    const total = papers.length;

    // Upload papers in parallel batches of 'concurrency' size
    for (let i = 0; i < papers.length; i += concurrency) {
      const batch = papers.slice(i, i + concurrency);

      const uploadPromises = batch.map(async (paper, batchIndex) => {
        const globalIndex = i + batchIndex;

        try {
          if (onProgress) {
            onProgress(globalIndex + 1, total, paper.paperId);
          }

          const result = await this.uploadPaper(
            paper.filePath,
            paper.paperId,
            paper.metadata
          );

          return { paperId: paper.paperId, result, success: true };
        } catch (error: any) {
          logger.error(`Failed to upload paper ${paper.paperId} in batch`, {
            error: error.message || error,
            stack: error.stack,
            paperId: paper.paperId,
            filePath: paper.filePath
          });
          return { paperId: paper.paperId, result: null, success: false };
        }
      });

      // Wait for all uploads in this parallel batch to complete
      const batchResults = await Promise.all(uploadPromises);

      // Collect successful results
      for (const { paperId, result, success } of batchResults) {
        if (success && result) {
          results.set(paperId, result);
        }
      }

      // Small delay between parallel batches to avoid overwhelming the service
      if (i + concurrency < papers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info(`Batch upload completed: ${results.size}/${total} papers successful`);
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

  async uploadFolder(
    folderPath: string,
    options?: {
      indexFile?: string;
      fallbackFile?: string;
      tags?: { name: string; value: string }[];
    }
  ): Promise<{
    manifestId: string;
    manifest: any;
    fileResponses: any[];
    manifestResponse: any;
  }> {
    if (!this.turbo) {
      await this.initialize();
    }

    try {
      logger.info(`Uploading folder: ${folderPath}`);

      const uploadResult = await this.turbo!.uploadFolder({
        folderPath,
        dataItemOpts: options?.tags ? { tags: options.tags } : undefined,
        manifestOptions: {
          indexFile: options?.indexFile || 'index.html',
          fallbackFile: options?.fallbackFile,
          disableManifest: false,
        },
      });

      // Debug: log the full response structure
      logger.info('Upload result structure', {
        hasManifest: !!uploadResult.manifest,
        hasManifestResponse: !!uploadResult.manifestResponse,
        manifestKeys: uploadResult.manifest ? Object.keys(uploadResult.manifest) : [],
        manifestResponseKeys: uploadResult.manifestResponse ? Object.keys(uploadResult.manifestResponse) : [],
        fileCount: uploadResult.fileResponses?.length,
      });

      // Try to get manifest ID from different possible locations
      const manifestId =
        (uploadResult.manifest as any)?.id ||
        (uploadResult.manifestResponse as any)?.id ||
        uploadResult.manifestResponse?.id ||
        '';

      logger.info('Folder uploaded successfully', {
        manifestId,
        fileCount: uploadResult.fileResponses?.length,
      });

      return {
        manifestId,
        manifest: uploadResult.manifest,
        fileResponses: uploadResult.fileResponses || [],
        manifestResponse: uploadResult.manifestResponse,
      };
    } catch (error: any) {
      logger.error('Failed to upload folder', {
        error: error.message || error,
        stack: error.stack,
        folderPath,
      });
      throw error;
    }
  }
}