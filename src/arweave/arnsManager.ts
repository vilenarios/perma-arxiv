import { ANT, ArweaveSigner } from '@ar.io/sdk';
import { readFileSync } from 'fs';
import logger from '../utils/logger';
import { ANT_PROCESS_ID_MAIN, ANT_PROCESS_ID_DATA, ARNS_TTL_SECONDS, ARNS_NAME_MAIN, ARNS_NAME_DATA } from '../config';

export interface ArnsUpdateResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class ArnsManager {
  private walletJWK: any;
  private signer: ArweaveSigner;
  private antProcessIdCache: Map<string, string> = new Map();

  constructor(walletPath: string) {
    this.walletJWK = JSON.parse(readFileSync(walletPath, 'utf-8'));
    this.signer = new ArweaveSigner(this.walletJWK);
  }

  /**
   * Discover ANT Process ID from ArNS name by making a HEAD request
   */
  private async discoverAntProcessId(arnsName: string): Promise<string> {
    // Check cache first
    if (this.antProcessIdCache.has(arnsName)) {
      return this.antProcessIdCache.get(arnsName)!;
    }

    try {
      const url = `https://${arnsName}.ar.io`;
      logger.info('Discovering ANT Process ID from ArNS name', { arnsName, url });

      const response = await fetch(url, { method: 'HEAD' });

      // Try multiple header name variations (case-sensitive)
      const antProcessId =
        response.headers.get('X-ArNS-Process-Id') ||
        response.headers.get('x-arns-process-id') ||
        response.headers.get('X-ARNS-PROCESS-ID');

      if (!antProcessId) {
        throw new Error(`No X-ArNS-Process-Id header found for ${arnsName}. Status: ${response.status}`);
      }

      logger.info('Discovered ANT Process ID', { arnsName, antProcessId });

      // Cache the result
      this.antProcessIdCache.set(arnsName, antProcessId);

      return antProcessId;
    } catch (error: any) {
      logger.error('Failed to discover ANT Process ID', { arnsName, error: error.message });
      throw new Error(`Could not discover ANT Process ID for ${arnsName}: ${error.message}`);
    }
  }

  /**
   * Update the main 'arxiv' ArNS name to point to a new web app deployment
   */
  async updateMainSite(transactionId: string): Promise<ArnsUpdateResult> {
    try {
      // Try to use configured ANT Process ID, otherwise discover it
      const antProcessId = ANT_PROCESS_ID_MAIN || await this.discoverAntProcessId(ARNS_NAME_MAIN);

      logger.info('Updating main site ArNS record', {
        name: ARNS_NAME_MAIN,
        transactionId,
        antProcessId
      });

      const ant = ANT.init({
        signer: this.signer,
        processId: antProcessId
      });

      // Update the root record (@)
      const result = await ant.setRecord({
        undername: '@',
        transactionId: transactionId,
        ttlSeconds: ARNS_TTL_SECONDS
      });

      logger.info('Main site ArNS record updated successfully', { result });

      return {
        success: true,
        messageId: typeof result === 'string' ? result : (result?.id || 'success')
      };
    } catch (error: any) {
      logger.error('Failed to update main site ArNS record', { error });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update the 'data_arxiv' ArNS name to point to a new parquet file
   */
  async updateDataIndex(transactionId: string, undername: string = '@'): Promise<ArnsUpdateResult> {
    try {
      // Try to use configured ANT Process ID, otherwise discover it
      const antProcessId = ANT_PROCESS_ID_DATA || await this.discoverAntProcessId(ARNS_NAME_DATA);

      logger.info('Updating data index ArNS record', {
        name: ARNS_NAME_DATA,
        undername,
        transactionId,
        antProcessId
      });

      const ant = ANT.init({
        signer: this.signer,
        processId: antProcessId
      });

      // Update the specified record
      const result = await ant.setRecord({
        undername: undername,
        transactionId: transactionId,
        ttlSeconds: ARNS_TTL_SECONDS
      });

      logger.info('Data index ArNS record updated successfully', { result });

      return {
        success: true,
        messageId: typeof result === 'string' ? result : (result?.id || 'success')
      };
    } catch (error: any) {
      logger.error('Failed to update data index ArNS record', { error });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get current ANT state for the main site
   */
  async getMainSiteState(): Promise<any> {
    try {
      if (!ANT_PROCESS_ID_MAIN) {
        throw new Error('ANT_PROCESS_ID_MAIN not configured. Please set it in your .env file.');
      }

      const ant = ANT.init({
        processId: ANT_PROCESS_ID_MAIN
      });

      const state = await ant.getState();
      return state;
    } catch (error: any) {
      logger.error('Failed to get main site ANT state', { error });
      throw error;
    }
  }

  /**
   * Get current ANT state for the data index
   */
  async getDataIndexState(): Promise<any> {
    try {
      if (!ANT_PROCESS_ID_DATA) {
        throw new Error('ANT_PROCESS_ID_DATA not configured. Please set it in your .env file.');
      }

      const ant = ANT.init({
        processId: ANT_PROCESS_ID_DATA
      });

      const state = await ant.getState();
      return state;
    } catch (error: any) {
      logger.error('Failed to get data index ANT state', { error });
      throw error;
    }
  }

  /**
   * Get all records from an ANT
   */
  async getRecords(antProcessId: string): Promise<any> {
    try {
      const ant = ANT.init({
        processId: antProcessId
      });

      const records = await ant.getRecords();
      return records;
    } catch (error: any) {
      logger.error('Failed to get ANT records', { error, antProcessId });
      throw error;
    }
  }

  /**
   * Verify ArNS configuration
   */
  async verifyConfiguration(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!ANT_PROCESS_ID_MAIN) {
      errors.push('ANT_PROCESS_ID_MAIN is not configured');
    }

    if (!ANT_PROCESS_ID_DATA) {
      errors.push('ANT_PROCESS_ID_DATA is not configured');
    }

    // Try to fetch states if process IDs are set
    if (ANT_PROCESS_ID_MAIN) {
      try {
        await this.getMainSiteState();
        logger.info('✓ Main site ANT is accessible');
      } catch (error: any) {
        errors.push(`Main site ANT error: ${error.message}`);
      }
    }

    if (ANT_PROCESS_ID_DATA) {
      try {
        await this.getDataIndexState();
        logger.info('✓ Data index ANT is accessible');
      } catch (error: any) {
        errors.push(`Data index ANT error: ${error.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
