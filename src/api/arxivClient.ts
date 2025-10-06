import axios, { AxiosInstance } from 'axios';
import { XMLParser } from 'fast-xml-parser';
import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { ArxivPaper, ArxivQueryParams } from '../types';
import { ARXIV_API_BASE, DEFAULT_RATE_LIMIT, USER_AGENT } from '../config';
import logger from '../utils/logger';

export class ArxivClient {
  private client: AxiosInstance;
  private parser: XMLParser;
  private limiter: ReturnType<typeof pLimit>;
  private lastRequestTime: number = 0;
  private minRequestInterval: number;

  constructor() {
    this.client = axios.create({
      baseURL: ARXIV_API_BASE,
      timeout: 30000,
      headers: {
        'User-Agent': USER_AGENT
      }
    });

    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true
    });

    this.limiter = pLimit(DEFAULT_RATE_LIMIT.maxConcurrent);
    this.minRequestInterval = 1000 / DEFAULT_RATE_LIMIT.requestsPerSecond;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  private parseEntry(entry: any): ArxivPaper {
    const authors = Array.isArray(entry.author)
      ? entry.author.map((a: any) => a.name)
      : [entry.author?.name || 'Unknown'];

    const categories = Array.isArray(entry.category)
      ? entry.category.map((c: any) => c['@_term'])
      : [entry.category?.['@_term'] || 'Unknown'];

    const id = entry.id.split('/abs/')[1] || entry.id;
    const versionMatch = id.match(/v(\d+)$/);
    const version = versionMatch ? parseInt(versionMatch[1]) : 1;

    return {
      id: id.replace(/v\d+$/, ''),
      updated: entry.updated,
      published: entry.published,
      title: entry.title.replace(/\s+/g, ' ').trim(),
      summary: entry.summary.replace(/\s+/g, ' ').trim(),
      authors,
      categories,
      pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
      abstractUrl: entry.id,
      version,
      comment: entry['arxiv:comment']?.['#text'],
      journalRef: entry['arxiv:journal_ref']?.['#text'],
      doi: entry['arxiv:doi']?.['#text']
    };
  }

  async search(params: ArxivQueryParams): Promise<{ papers: ArxivPaper[], totalResults: number }> {
    return this.limiter(async () => {
      await this.enforceRateLimit();

      const queryParams: any = {
        start: params.start || 0,
        max_results: params.maxResults || 10
      };

      if (params.searchQuery) {
        queryParams.search_query = params.searchQuery;
      }

      if (params.idList && params.idList.length > 0) {
        queryParams.id_list = params.idList.join(',');
      }

      if (params.sortBy) {
        queryParams.sortBy = params.sortBy;
      }

      if (params.sortOrder) {
        queryParams.sortOrder = params.sortOrder;
      }

      try {
        const response = await pRetry(
          async () => {
            logger.info('Fetching from ArXiv API', { params: queryParams });
            const res = await this.client.get('', { params: queryParams });
            return res;
          },
          {
            retries: DEFAULT_RATE_LIMIT.retryAttempts,
            minTimeout: DEFAULT_RATE_LIMIT.retryDelay,
            onFailedAttempt: error => {
              logger.warn(`API request failed, attempt ${error.attemptNumber}/${DEFAULT_RATE_LIMIT.retryAttempts}`, {
                error: error.message
              });
            }
          }
        );

        const parsed = this.parser.parse(response.data);
        const feed = parsed.feed;

        if (!feed || !feed.entry) {
          return { papers: [], totalResults: 0 };
        }

        const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
        const papers = entries.map(entry => this.parseEntry(entry));

        const totalResults = parseInt(feed['opensearch:totalResults']) || papers.length;

        logger.info(`Fetched ${papers.length} papers from ArXiv`);
        return { papers, totalResults };

      } catch (error) {
        logger.error('Failed to fetch from ArXiv API', { error });
        throw error;
      }
    });
  }

  async searchByCategory(category: string, start: number = 0, maxResults: number = 100): Promise<{ papers: ArxivPaper[], totalResults: number }> {
    const searchQuery = `cat:${category}`;
    return this.search({
      searchQuery,
      start,
      maxResults,
      sortBy: 'lastUpdatedDate',
      sortOrder: 'descending'
    });
  }

  async searchByDateRange(startDate: string, endDate: string, start: number = 0, maxResults: number = 100): Promise<{ papers: ArxivPaper[], totalResults: number }> {
    const searchQuery = `lastUpdatedDate:[${startDate} TO ${endDate}]`;
    return this.search({
      searchQuery,
      start,
      maxResults,
      sortBy: 'lastUpdatedDate',
      sortOrder: 'descending'
    });
  }

  async getByIds(ids: string[]): Promise<ArxivPaper[]> {
    if (ids.length === 0) return [];

    const batchSize = 50;
    const results: ArxivPaper[] = [];

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const { papers } = await this.search({ idList: batch, maxResults: batchSize });
      results.push(...papers);
    }

    return results;
  }
}