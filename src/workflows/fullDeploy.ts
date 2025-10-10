import { ParquetExporter } from '../index/parquetExporter';
import { ArnsManager } from '../arweave/arnsManager';
import { TurboUploader } from '../arweave/turboUploader';
import logger from '../utils/logger';

export interface FullDeploymentOptions {
  walletPath: string;
  exportParquet?: boolean;
  uploadData?: boolean;
  updateDataArns?: boolean;
  uploadWebViewer?: boolean;
  updateSiteArns?: boolean;
  webViewerPath?: string;
}

export interface DeploymentResult {
  success: boolean;
  steps: {
    parquetExport?: { success: boolean; files?: string[]; error?: string };
    dataUpload?: { success: boolean; transactionId?: string; error?: string };
    dataArnsUpdate?: { success: boolean; messageId?: string; error?: string };
    webViewerUpload?: { success: boolean; transactionId?: string; error?: string };
    siteArnsUpdate?: { success: boolean; messageId?: string; error?: string };
  };
  errors: string[];
}

/**
 * Full automated deployment workflow for PermaArxiv
 * Handles: Export → Upload → ArNS Update for both data and web viewer
 */
export async function fullDeployment(options: FullDeploymentOptions): Promise<DeploymentResult> {
  const result: DeploymentResult = {
    success: true,
    steps: {},
    errors: []
  };

  const arnsManager = new ArnsManager(options.walletPath);
  const uploader = new TurboUploader(options.walletPath);

  try {
    // Initialize uploader
    await uploader.initialize();
    logger.info('🚀 Starting full deployment workflow');

    // Step 1: Export data to Parquet
    if (options.exportParquet !== false) {
      logger.info('📦 Step 1/5: Exporting data to Parquet...');
      try {
        const exporter = new ParquetExporter();
        await exporter.initialize();

        const files = await exporter.exportToParquet();
        result.steps.parquetExport = {
          success: true,
          files
        };

        logger.info(`✅ Exported ${files.length} parquet file(s)`);
        await exporter.close();
      } catch (error: any) {
        result.steps.parquetExport = {
          success: false,
          error: error.message
        };
        result.errors.push(`Parquet export failed: ${error.message}`);
        result.success = false;

        // If export fails, we can't continue
        logger.error('❌ Parquet export failed, aborting deployment');
        return result;
      }
    }

    // Step 2: Upload parquet to Arweave
    if (options.uploadData !== false && result.steps.parquetExport?.files?.[0]) {
      logger.info('📤 Step 2/5: Uploading parquet to Arweave...');
      try {
        const mainParquetFile = result.steps.parquetExport.files[0];
        const uploadResult = await uploader.uploadPaper(
          mainParquetFile,
          'parquet-index',
          {
            title: 'ArXiv Parquet Index',
            authors: 'PermaArxiv',
            categories: 'data',
            published: new Date().toISOString()
          }
        );

        if (uploadResult && uploadResult.id) {
          result.steps.dataUpload = {
            success: true,
            transactionId: uploadResult.id
          };

          logger.info(`✅ Parquet uploaded: ${uploadResult.id}`);
        } else {
          throw new Error('Upload failed: no transaction ID returned');
        }
      } catch (error: any) {
        result.steps.dataUpload = {
          success: false,
          error: error.message
        };
        result.errors.push(`Data upload failed: ${error.message}`);
        result.success = false;

        logger.error('❌ Data upload failed, continuing with remaining steps...');
      }
    }

    // Step 3: Update data_arxiv ArNS
    if (options.updateDataArns !== false && result.steps.dataUpload?.transactionId) {
      logger.info('🔄 Step 3/5: Updating data_arxiv ArNS...');
      try {
        const arnsResult = await arnsManager.updateDataIndex(
          result.steps.dataUpload.transactionId
        );

        if (arnsResult.success) {
          result.steps.dataArnsUpdate = {
            success: true,
            messageId: arnsResult.messageId
          };

          logger.info(`✅ data_arxiv ArNS updated: ${arnsResult.messageId}`);
        } else {
          throw new Error(arnsResult.error || 'ArNS update failed');
        }
      } catch (error: any) {
        result.steps.dataArnsUpdate = {
          success: false,
          error: error.message
        };
        result.errors.push(`Data ArNS update failed: ${error.message}`);
        result.success = false;

        logger.error('❌ Data ArNS update failed');
      }
    }

    // Step 4: Upload web viewer (if path provided)
    if (options.uploadWebViewer && options.webViewerPath) {
      logger.info('📤 Step 4/5: Uploading web viewer...');
      try {
        const uploadResult = await uploader.uploadPaper(
          options.webViewerPath,
          'web-viewer',
          {
            title: 'ArXiv Web Viewer',
            authors: 'PermaArxiv',
            categories: 'web',
            published: new Date().toISOString()
          }
        );

        if (uploadResult && uploadResult.id) {
          result.steps.webViewerUpload = {
            success: true,
            transactionId: uploadResult.id
          };

          logger.info(`✅ Web viewer uploaded: ${uploadResult.id}`);
        } else {
          throw new Error('Web viewer upload failed: no transaction ID returned');
        }
      } catch (error: any) {
        result.steps.webViewerUpload = {
          success: false,
          error: error.message
        };
        result.errors.push(`Web viewer upload failed: ${error.message}`);
        result.success = false;

        logger.error('❌ Web viewer upload failed');
      }
    }

    // Step 5: Update arxiv ArNS
    if (options.updateSiteArns && result.steps.webViewerUpload?.transactionId) {
      logger.info('🔄 Step 5/5: Updating arxiv ArNS...');
      try {
        const arnsResult = await arnsManager.updateMainSite(
          result.steps.webViewerUpload.transactionId
        );

        if (arnsResult.success) {
          result.steps.siteArnsUpdate = {
            success: true,
            messageId: arnsResult.messageId
          };

          logger.info(`✅ arxiv ArNS updated: ${arnsResult.messageId}`);
        } else {
          throw new Error(arnsResult.error || 'ArNS update failed');
        }
      } catch (error: any) {
        result.steps.siteArnsUpdate = {
          success: false,
          error: error.message
        };
        result.errors.push(`Site ArNS update failed: ${error.message}`);
        result.success = false;

        logger.error('❌ Site ArNS update failed');
      }
    }

    // Summary
    if (result.success) {
      logger.info('🎉 Full deployment completed successfully!');
      logger.info(`📊 Data available at: https://data_arxiv.arweave.net`);
      if (result.steps.siteArnsUpdate?.success) {
        logger.info(`🌐 Site available at: https://arxiv.arweave.net`);
      }
    } else {
      logger.warn('⚠️  Deployment completed with errors');
      result.errors.forEach(err => logger.error(`  - ${err}`));
    }

  } catch (error: any) {
    logger.error('💥 Deployment failed catastrophically', { error });
    result.success = false;
    result.errors.push(`Unexpected error: ${error.message}`);
  }

  return result;
}

/**
 * Quick data update workflow (export + upload + update ArNS)
 */
export async function quickDataUpdate(walletPath: string): Promise<DeploymentResult> {
  logger.info('⚡ Starting quick data update...');

  return fullDeployment({
    walletPath,
    exportParquet: true,
    uploadData: true,
    updateDataArns: true,
    uploadWebViewer: false,
    updateSiteArns: false
  });
}

/**
 * Web viewer only update workflow (upload viewer + update ArNS)
 */
export async function quickSiteUpdate(
  walletPath: string,
  webViewerPath: string
): Promise<DeploymentResult> {
  logger.info('⚡ Starting quick site update...');

  return fullDeployment({
    walletPath,
    exportParquet: false,
    uploadData: false,
    updateDataArns: false,
    uploadWebViewer: true,
    updateSiteArns: true,
    webViewerPath
  });
}
