import { ArxivClient } from '../api/arxivClient';
import { Database } from '../database';
import { PdfDownloader } from '../downloader';
import { SmartFilter } from '../importance/smartFilter';
import { ArxivPaper } from '../types';
import logger from '../utils/logger';

export interface ImportantPapersOptions {
  categories?: string[];
  daysBack?: number;
  minScore?: number;
  maxPapers?: number;
  downloadPdfs?: boolean;
  filterType?: 'all' | 'conference' | 'journal' | 'survey' | 'with-code';
}

export class ImportantPapersScraper {
  private client: ArxivClient;
  private db: Database;
  private downloader: PdfDownloader;
  private filter: SmartFilter;

  constructor() {
    this.client = new ArxivClient();
    this.db = new Database();
    this.downloader = new PdfDownloader();
    this.filter = new SmartFilter();
  }

  async initialize(): Promise<void> {
    await this.db.initialize();
    await this.downloader.ensureDownloadDirectory();
  }

  async scrapeImportantPapers(options: ImportantPapersOptions = {}): Promise<ArxivPaper[]> {
    const {
      categories = ['cs.LG', 'cs.AI'],
      daysBack = 30,
      minScore = 10,
      maxPapers = 100,
      downloadPdfs = true,
      filterType = 'all'
    } = options;

    logger.info('Starting important papers scrape', options);

    // Build search queries for important papers
    const searchQueries = this.buildSearchQueries(categories, daysBack);
    const allPapers: ArxivPaper[] = [];

    for (const query of searchQueries) {
      logger.info(`Searching: ${query}`);

      const { papers } = await this.client.search({
        searchQuery: query,
        maxResults: 200,
        sortBy: 'lastUpdatedDate',
        sortOrder: 'descending'
      });

      allPapers.push(...papers);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info(`Collected ${allPapers.length} papers, filtering for importance...`);

    // Apply smart filtering
    let importantPapers: ArxivPaper[];

    switch (filterType) {
      case 'conference':
        importantPapers = this.filter.getConferencePapers(allPapers);
        break;
      case 'journal':
        importantPapers = this.filter.getJournalPapers(allPapers);
        break;
      case 'survey':
        importantPapers = this.filter.getSurveyPapers(allPapers);
        break;
      case 'with-code':
        importantPapers = this.filter.getPapersWithCode(allPapers);
        break;
      default:
        importantPapers = this.filter.filterImportantPapers(allPapers, minScore, maxPapers);
    }

    logger.info(`Filtered to ${importantPapers.length} important papers`);

    // Store in database
    for (const paper of importantPapers) {
      await this.db.upsertPaper(paper);
    }

    // Download PDFs if requested
    if (downloadPdfs && importantPapers.length > 0) {
      logger.info(`Downloading PDFs for ${importantPapers.length} important papers`);
      const results = await this.downloader.downloadBatch(importantPapers);

      for (const [paperId, result] of results) {
        if (result.success && result.path) {
          await this.db.markAsDownloaded(paperId, result.path);
        }
      }
    }

    return importantPapers;
  }

  private buildSearchQueries(categories: string[], daysBack: number): string[] {
    const queries: string[] = [];
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const dateRange = `submittedDate:[${this.formatDate(startDate)} TO ${this.formatDate(endDate)}]`;

    // Search for important keywords in each category
    const importantTerms = [
      'state-of-the-art',
      'benchmark',
      'foundation model',
      'survey',
      'breakthrough',
      'neurips',
      'icml',
      'iclr',
      'cvpr'
    ];

    for (const category of categories) {
      // Get recent papers from category
      queries.push(`cat:${category} AND ${dateRange}`);

      // Search for important terms in category
      for (const term of importantTerms.slice(0, 3)) {
        queries.push(`cat:${category} AND all:"${term}" AND ${dateRange}`);
      }
    }

    return queries;
  }

  async scrapeTopPapersThisWeek(categories: string[] = ['cs.LG', 'cs.AI']): Promise<ArxivPaper[]> {
    logger.info('Scraping top papers from this week');

    const papers: ArxivPaper[] = [];

    for (const category of categories) {
      const { papers: categoryPapers } = await this.client.searchByCategory(
        category,
        0,
        100
      );

      // Filter to last 7 days
      const recentPapers = categoryPapers.filter(p => {
        const daysOld = (Date.now() - new Date(p.published).getTime()) / (1000 * 60 * 60 * 24);
        return daysOld <= 7;
      });

      papers.push(...recentPapers);
    }

    // Filter and rank
    const importantPapers = this.filter.filterImportantPapers(papers, 8, 20);

    for (const paper of importantPapers) {
      await this.db.upsertPaper(paper);
      const signals = this.filter.analyzeImportance(paper);

      logger.info(`Important paper found:`, {
        id: paper.id,
        title: paper.title.substring(0, 100),
        score: signals.importanceScore,
        venue: signals.venuePrestige,
        hasCode: signals.hasCodeRepository
      });
    }

    return importantPapers;
  }

  async findHiddenGems(categories: string[] = ['cs.LG']): Promise<ArxivPaper[]> {
    logger.info('Searching for hidden gems (high-quality papers with code)');

    const papers: ArxivPaper[] = [];

    // Search for papers with implementation details
    const codeQueries = [
      'implementation',
      'github.com',
      'experiments',
      'reproducible',
      'open source'
    ];

    for (const category of categories) {
      for (const query of codeQueries) {
        const { papers: found } = await this.client.search({
          searchQuery: `cat:${category} AND all:"${query}"`,
          maxResults: 50,
          sortBy: 'lastUpdatedDate',
          sortOrder: 'descending'
        });

        papers.push(...found);

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // De-duplicate
    const uniquePapers = Array.from(
      new Map(papers.map(p => [p.id, p])).values()
    );

    // Filter for papers with code
    const withCode = this.filter.getPapersWithCode(uniquePapers);

    logger.info(`Found ${withCode.length} papers with code implementations`);

    return withCode;
  }

  async analyzeExistingDatabase(): Promise<void> {
    logger.info('Analyzing existing database for important papers...');

    // Get all papers from database
    const papers = await this.db.getUndownloadedPapers(1000);

    // Analyze each
    const analyzed = papers.map(paper => ({
      paper,
      signals: this.filter.analyzeImportance(paper)
    }));

    // Sort by importance
    analyzed.sort((a, b) => b.signals.importanceScore - a.signals.importanceScore);

    // Show top papers
    logger.info('\n=== Top 10 Most Important Undownloaded Papers ===\n');

    for (const item of analyzed.slice(0, 10)) {
      const { paper, signals } = item;
      console.log(`Score: ${signals.importanceScore}`);
      console.log(`Title: ${paper.title}`);
      console.log(`Authors: ${paper.authors.slice(0, 3).join(', ')}`);

      if (signals.venuePrestige > 0) {
        console.log(`Venue: Prestige ${signals.venuePrestige}/10`);
      }

      if (signals.hasJournalPublication) {
        console.log(`Journal: ${paper.journalRef}`);
      }

      if (signals.hasCodeRepository) {
        console.log(`Has Code: Yes`);
      }

      console.log(`URL: https://arxiv.org/abs/${paper.id}`);
      console.log('---\n');
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0].replace(/-/g, '');
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}