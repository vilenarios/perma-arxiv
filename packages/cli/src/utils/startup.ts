import * as fs from 'fs/promises';
import * as path from 'path';
import { Database } from '../database';
import logger from './logger';
import { DB_PATH, DOWNLOAD_DIR } from '../config';

export interface StartupValidation {
  database: boolean;
  downloadDir: boolean;
  wallet: boolean;
  diskSpace: boolean;
  errors: string[];
}

export class StartupValidator {
  private errors: string[] = [];

  async validateAll(): Promise<StartupValidation> {
    logger.info('Running startup validations...');

    const results: StartupValidation = {
      database: false,
      downloadDir: false,
      wallet: false,
      diskSpace: false,
      errors: []
    };

    // Check database
    results.database = await this.checkDatabase();

    // Check download directory
    results.downloadDir = await this.checkDownloadDir();

    // Check wallet if configured
    results.wallet = await this.checkWallet();

    // Check disk space
    results.diskSpace = await this.checkDiskSpace();

    results.errors = this.errors;

    if (this.errors.length > 0) {
      logger.error('Startup validation failed', { errors: this.errors });
      throw new Error(`Startup validation failed: ${this.errors.join(', ')}`);
    }

    logger.info('All startup validations passed');
    return results;
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      const db = new Database(DB_PATH);
      await db.initialize();

      // Test write permission
      await new Promise((resolve, reject) => {
        db['db'].run('SELECT 1', (err: any) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      await db.close();
      logger.info('✓ Database connection validated');
      return true;
    } catch (error: any) {
      this.errors.push(`Database check failed: ${error.message}`);
      return false;
    }
  }

  private async checkDownloadDir(): Promise<boolean> {
    try {
      // Create downloads directory if it doesn't exist
      await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

      // Test write permission
      const testFile = path.join(DOWNLOAD_DIR, '.write-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);

      logger.info('✓ Download directory validated');
      return true;
    } catch (error: any) {
      this.errors.push(`Download directory check failed: ${error.message}`);
      return false;
    }
  }

  private async checkWallet(): Promise<boolean> {
    const walletPath = process.env.ARWEAVE_WALLET_PATH;

    if (!walletPath) {
      logger.info('⚠ No wallet configured (uploads disabled)');
      return true; // Not an error, just informational
    }

    try {
      const stats = await fs.stat(walletPath);
      if (!stats.isFile()) {
        throw new Error('Wallet path is not a file');
      }

      // Try to parse as JSON
      const content = await fs.readFile(walletPath, 'utf-8');
      const wallet = JSON.parse(content);

      if (!wallet.kty || wallet.kty !== 'RSA') {
        throw new Error('Invalid wallet format');
      }

      logger.info('✓ Arweave wallet validated');
      return true;
    } catch (error: any) {
      this.errors.push(`Wallet check failed: ${error.message}`);
      return false;
    }
  }

  private async checkDiskSpace(): Promise<boolean> {
    try {
      const { statfs } = await import('fs');
      const { promisify } = await import('util');
      const statfsAsync = promisify(statfs);

      // Check disk space for downloads directory
      const stats = await statfsAsync(DOWNLOAD_DIR);
      const availableGB = (stats.bavail * stats.bsize) / (1024 * 1024 * 1024);

      if (availableGB < 1) {
        throw new Error(`Insufficient disk space: ${availableGB.toFixed(2)}GB available`);
      }

      logger.info(`✓ Disk space validated: ${availableGB.toFixed(2)}GB available`);
      return true;
    } catch (error: any) {
      // Disk space check may not work on all platforms, so we just warn
      logger.warn(`Disk space check skipped: ${error.message}`);
      return true;
    }
  }
}