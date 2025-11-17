import { Database } from '../database';
import { TurboUploader } from '../arweave/turboUploader';
import * as fs from 'fs/promises';
import * as path from 'path';
import logger from './logger';
import { DB_PATH, DOWNLOAD_DIR } from '../config';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: CheckResult;
    filesystem: CheckResult;
    arweave?: CheckResult;
    diskSpace: CheckResult;
  };
  summary: {
    totalPapers: number;
    downloadedPapers: number;
    uploadedPapers: number;
    pendingUploads: number;
  };
}

interface CheckResult {
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: any;
}

export class HealthCheck {
  private db: Database;

  constructor() {
    this.db = new Database(DB_PATH);
  }

  async check(): Promise<HealthStatus> {
    const results: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: await this.checkDatabase(),
        filesystem: await this.checkFilesystem(),
        diskSpace: await this.checkDiskSpace()
      },
      summary: {
        totalPapers: 0,
        downloadedPapers: 0,
        uploadedPapers: 0,
        pendingUploads: 0
      }
    };

    // Check Arweave if wallet is configured
    if (process.env.ARWEAVE_WALLET_PATH) {
      results.checks.arweave = await this.checkArweave();
    }

    // Get database statistics
    try {
      await this.db.initialize();
      const stats = await this.db.getUploadStats();
      results.summary = {
        totalPapers: stats.total_downloaded || 0,
        downloadedPapers: stats.total_downloaded || 0,
        uploadedPapers: stats.uploaded || 0,
        pendingUploads: stats.pending_upload || 0
      };
    } catch (error) {
      logger.error('Failed to get database statistics', { error });
    }

    // Determine overall health status
    const checks = Object.values(results.checks);
    if (checks.some(c => c.status === 'error')) {
      results.status = 'unhealthy';
    } else if (checks.some(c => c.status === 'warning')) {
      results.status = 'degraded';
    }

    return results;
  }

  private async checkDatabase(): Promise<CheckResult> {
    try {
      // Test database connection
      await new Promise((resolve, reject) => {
        this.db['db'].get('SELECT COUNT(*) as count FROM papers', (err: any, row: any) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      return {
        status: 'ok',
        message: 'Database is accessible and operational'
      };
    } catch (error: any) {
      return {
        status: 'error',
        message: 'Database connection failed',
        details: error.message
      };
    }
  }

  private async checkFilesystem(): Promise<CheckResult> {
    try {
      // Check if downloads directory is accessible
      await fs.access(DOWNLOAD_DIR);

      // Count PDF files
      const files = await fs.readdir(DOWNLOAD_DIR);
      let pdfCount = 0;
      let totalSize = 0;

      for (const category of files) {
        const categoryPath = path.join(DOWNLOAD_DIR, category);
        const stats = await fs.stat(categoryPath);

        if (stats.isDirectory()) {
          const categoryFiles = await fs.readdir(categoryPath);
          const pdfs = categoryFiles.filter(f => f.endsWith('.pdf'));
          pdfCount += pdfs.length;

          // Calculate total size
          for (const pdf of pdfs) {
            const pdfPath = path.join(categoryPath, pdf);
            const pdfStats = await fs.stat(pdfPath);
            totalSize += pdfStats.size;
          }
        }
      }

      const sizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);

      return {
        status: 'ok',
        message: 'Filesystem is accessible',
        details: {
          pdfCount,
          totalSize: `${sizeGB} GB`
        }
      };
    } catch (error: any) {
      return {
        status: 'warning',
        message: 'Filesystem check failed',
        details: error.message
      };
    }
  }

  private async checkArweave(): Promise<CheckResult> {
    try {
      const uploader = new TurboUploader(process.env.ARWEAVE_WALLET_PATH!);
      await uploader.initialize();
      const balance = await uploader.checkBalance();

      const arBalance = parseFloat(balance.ar);
      const status = arBalance > 0.01 ? 'ok' : 'warning';
      const message = arBalance > 0.01
        ? 'Arweave connection healthy'
        : 'Low Arweave balance';

      return {
        status,
        message,
        details: {
          balance: `${balance.ar} AR`,
          winc: balance.winc
        }
      };
    } catch (error: any) {
      return {
        status: 'error',
        message: 'Arweave connection failed',
        details: error.message
      };
    }
  }

  private async checkDiskSpace(): Promise<CheckResult> {
    try {
      const { statfs } = await import('fs');
      const { promisify } = await import('util');
      const statfsAsync = promisify(statfs);

      const stats = await statfsAsync(DOWNLOAD_DIR);
      const availableGB = (stats.bavail * stats.bsize) / (1024 * 1024 * 1024);
      const totalGB = (stats.blocks * stats.bsize) / (1024 * 1024 * 1024);
      const usedPercent = ((totalGB - availableGB) / totalGB * 100).toFixed(1);

      const status = availableGB > 5 ? 'ok' : availableGB > 1 ? 'warning' : 'error';
      const message = availableGB > 5
        ? 'Sufficient disk space available'
        : availableGB > 1
        ? 'Low disk space'
        : 'Critical: Very low disk space';

      return {
        status,
        message,
        details: {
          available: `${availableGB.toFixed(2)} GB`,
          total: `${totalGB.toFixed(2)} GB`,
          usedPercent: `${usedPercent}%`
        }
      };
    } catch (error: any) {
      return {
        status: 'warning',
        message: 'Disk space check unavailable',
        details: 'Platform not supported'
      };
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

// CLI command support
export async function runHealthCheck(): Promise<void> {
  const checker = new HealthCheck();

  try {
    const status = await checker.check();

    console.log('\n=== Health Check Report ===\n');
    console.log(`Status: ${status.status.toUpperCase()}`);
    console.log(`Timestamp: ${status.timestamp}\n`);

    console.log('System Checks:');
    for (const [name, check] of Object.entries(status.checks)) {
      const icon = check.status === 'ok' ? '✓' : check.status === 'warning' ? '⚠' : '✗';
      console.log(`  ${icon} ${name}: ${check.message}`);
      if (check.details) {
        console.log(`     Details: ${JSON.stringify(check.details)}`);
      }
    }

    console.log('\nDatabase Summary:');
    console.log(`  Total Papers: ${status.summary.totalPapers}`);
    console.log(`  Downloaded: ${status.summary.downloadedPapers}`);
    console.log(`  Uploaded: ${status.summary.uploadedPapers}`);
    console.log(`  Pending Upload: ${status.summary.pendingUploads}`);

    await checker.close();

    // Exit with appropriate code
    process.exit(status.status === 'healthy' ? 0 : 1);
  } catch (error) {
    logger.error('Health check failed', { error });
    await checker.close();
    process.exit(2);
  }
}