import { ArxivClient } from '../api/arxivClient';
import { Database } from '../database';
import { PdfDownloader } from '../downloader';
import { ArxivPaper } from '../types';
import logger from '../utils/logger';

export interface SmartScraperOptions {
  categories?: string[];
  daysBack?: number;
  onlyPeerReviewed?: boolean;
  sampleSize?: number;
  minVersions?: number;
  downloadPdfs?: boolean;
}

export class SmartScraper {
  private client: ArxivClient;
  private db: Database;
  private downloader: PdfDownloader;

  constructor() {
    this.client = new ArxivClient();
    this.db = new Database();
    this.downloader = new PdfDownloader();
  }

  async initialize(): Promise<void> {
    await this.db.initialize();
    await this.downloader.ensureDownloadDirectory();
  }

  async scrapePeerReviewed(options: SmartScraperOptions = {}): Promise<ArxivPaper[]> {
    const {
      categories = ['cs.LG', 'cs.AI'],
      daysBack = 30,
      sampleSize = 100,
      downloadPdfs = true
    } = options;

    logger.info('Starting smart scrape for peer-reviewed papers', options);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const allPapers: ArxivPaper[] = [];

    for (const category of categories) {
      logger.info(`Searching category ${category} from last ${daysBack} days`);

      // Search with date range
      const searchQuery = `cat:${category} AND submittedDate:[${this.formatDate(startDate)} TO ${this.formatDate(endDate)}]`;

      let collected = 0;
      let start = 0;
      const batchSize = 100;

      while (collected < sampleSize) {
        const { papers } = await this.client.search({
          searchQuery,
          start,
          maxResults: batchSize,
          sortBy: 'lastUpdatedDate',
          sortOrder: 'descending'
        });

        if (papers.length === 0) break;

        // Filter for peer-reviewed papers
        const peerReviewed = papers.filter(p => this.isPeerReviewed(p));

        allPapers.push(...peerReviewed);
        collected += peerReviewed.length;

        logger.info(`Found ${peerReviewed.length} peer-reviewed papers in batch (${collected} total)`);

        if (papers.length < batchSize) break;
        start += batchSize;

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Sample if we have too many
    const sampledPapers = this.samplePapers(allPapers, sampleSize);

    // Store in database
    for (const paper of sampledPapers) {
      await this.db.upsertPaper(paper);
    }

    // Download PDFs if requested
    if (downloadPdfs && sampledPapers.length > 0) {
      logger.info(`Downloading PDFs for ${sampledPapers.length} papers`);
      const results = await this.downloader.downloadBatch(sampledPapers);

      for (const [paperId, result] of results) {
        if (result.success && result.path) {
          await this.db.markAsDownloaded(paperId, result.path);
        }
      }
    }

    logger.info(`Completed smart scrape: ${sampledPapers.length} papers`);
    return sampledPapers;
  }

  async scrapeHighQuality(options: SmartScraperOptions = {}): Promise<ArxivPaper[]> {
    const {
      categories = ['cs.LG', 'cs.AI'],
      daysBack = 90,
      minVersions = 2,
      sampleSize = 50
    } = options;

    logger.info('Scraping high-quality papers (multiple versions = active research)');

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const qualityPapers: ArxivPaper[] = [];

    for (const category of categories) {
      const searchQuery = `cat:${category} AND submittedDate:[${this.formatDate(startDate)} TO ${this.formatDate(endDate)}]`;

      const { papers } = await this.client.search({
        searchQuery,
        maxResults: 500,
        sortBy: 'lastUpdatedDate',
        sortOrder: 'descending'
      });

      // Filter for quality indicators
      const highQuality = papers.filter(p => {
        const hasMultipleVersions = p.version >= minVersions;
        const hasJournalRef = !!p.journalRef;
        const hasDetailedComment = p.comment && p.comment.length > 100;
        const isConferencePaper = this.isConferencePaper(p);

        // Paper is high quality if it has 2+ of these indicators
        const indicators = [hasMultipleVersions, hasJournalRef, hasDetailedComment, isConferencePaper];
        return indicators.filter(Boolean).length >= 2;
      });

      qualityPapers.push(...highQuality);
      logger.info(`Found ${highQuality.length} high-quality papers in ${category}`);
    }

    // Sample and return
    return this.samplePapers(qualityPapers, sampleSize);
  }

  async scrapeWeeklyTop(categories: string[] = ['cs.LG', 'cs.AI'], topN: number = 10): Promise<ArxivPaper[]> {
    logger.info('Scraping top papers from last week');

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const topPapers: ArxivPaper[] = [];

    for (const category of categories) {
      const searchQuery = `cat:${category} AND submittedDate:[${this.formatDate(startDate)} TO ${this.formatDate(endDate)}]`;

      const { papers } = await this.client.search({
        searchQuery,
        maxResults: 100,
        sortBy: 'lastUpdatedDate',
        sortOrder: 'descending'
      });

      // Score papers based on quality signals
      const scoredPapers = papers.map(paper => ({
        paper,
        score: this.calculateQualityScore(paper)
      }));

      // Sort by score and take top N
      scoredPapers.sort((a, b) => b.score - a.score);
      const categoryTop = scoredPapers.slice(0, topN).map(sp => sp.paper);

      topPapers.push(...categoryTop);
      logger.info(`Selected top ${categoryTop.length} papers from ${category}`);
    }

    return topPapers;
  }

  private isPeerReviewed(paper: ArxivPaper): boolean {
    // Check if paper has journal reference (published in peer-reviewed venue)
    if (paper.journalRef) {
      const journalLower = paper.journalRef.toLowerCase();

      // Check for known conference/journal patterns
      const peerReviewedVenues = [
        'neurips', 'nips', 'icml', 'iclr', 'cvpr', 'iccv', 'eccv',
        'acl', 'emnlp', 'naacl', 'aaai', 'ijcai', 'kdd', 'www',
        'nature', 'science', 'pnas', 'ieee', 'acm', 'jmlr', 'pami'
      ];

      return peerReviewedVenues.some(venue => journalLower.includes(venue));
    }

    // Check comment field for conference acceptance
    if (paper.comment) {
      const commentLower = paper.comment.toLowerCase();
      return commentLower.includes('accepted') ||
             commentLower.includes('to appear') ||
             commentLower.includes('conference') ||
             commentLower.includes('workshop');
    }

    return false;
  }

  private isConferencePaper(paper: ArxivPaper): boolean {
    const comment = (paper.comment || '').toLowerCase();
    const journalRef = (paper.journalRef || '').toLowerCase();

    const conferences = ['conference', 'symposium', 'workshop', 'proceedings'];
    return conferences.some(conf =>
      comment.includes(conf) || journalRef.includes(conf)
    );
  }

  private calculateQualityScore(paper: ArxivPaper): number {
    let score = 0;

    // Has journal reference (peer-reviewed)
    if (paper.journalRef) score += 3;

    // Multiple versions (active development)
    score += Math.min(paper.version - 1, 3);

    // Has detailed comment
    if (paper.comment && paper.comment.length > 50) score += 1;

    // Is conference paper
    if (this.isConferencePaper(paper)) score += 2;

    // Is from known venue
    if (this.isPeerReviewed(paper)) score += 3;

    // Multiple categories (interdisciplinary)
    if (paper.categories.length > 1) score += 1;

    // Recent (last 7 days gets bonus)
    const daysOld = (Date.now() - new Date(paper.published).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld <= 7) score += 2;

    return score;
  }

  private samplePapers(papers: ArxivPaper[], sampleSize: number): ArxivPaper[] {
    if (papers.length <= sampleSize) return papers;

    // Random sampling
    const shuffled = [...papers].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, sampleSize);
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0].replace(/-/g, '');
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}