import { RateLimitOptions } from '../types';

export const ARXIV_API_BASE = 'http://export.arxiv.org/api/query';
export const ARXIV_PDF_BASE = 'https://arxiv.org/pdf';

export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  maxConcurrent: 3,
  requestsPerSecond: 1,
  retryAttempts: 3,
  retryDelay: 5000,
};

export const BATCH_SIZE = 100;
export const DOWNLOAD_DIR = './downloads';
export const DB_PATH = './arxiv.db';

export const USER_AGENT = 'ArxivScraper/1.0.0 (https://github.com/yourusername/arxiv-scraper)';

export const CATEGORIES = [
  'cs.AI', 'cs.CL', 'cs.CV', 'cs.LG', 'cs.NE', 'cs.RO',
  'math.CO', 'math.GT', 'math.NA', 'math.NT',
  'physics.acc-ph', 'physics.ao-ph', 'physics.atom-ph',
  'q-bio.BM', 'q-bio.CB', 'q-bio.GN',
  'stat.ML', 'stat.TH'
];