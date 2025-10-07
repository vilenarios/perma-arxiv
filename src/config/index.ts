import { RateLimitOptions } from '../types';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const ARXIV_API_BASE = process.env.ARXIV_API_BASE || 'http://export.arxiv.org/api/query';
export const ARXIV_PDF_BASE = process.env.ARXIV_PDF_BASE || 'https://arxiv.org/pdf';

export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '3'),
  requestsPerSecond: parseInt(process.env.REQUESTS_PER_SECOND || '1'),
  retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
  retryDelay: parseInt(process.env.RETRY_DELAY || '5000'),
};

export const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100');
export const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || './downloads';
export const DB_PATH = process.env.DB_PATH || './arxiv.db';

export const USER_AGENT = process.env.USER_AGENT || 'ArxivScraper/1.0.0 (https://github.com/vilenarios/perma-arxiv)';

export const CATEGORIES = [
  'cs.AI', 'cs.CL', 'cs.CV', 'cs.LG', 'cs.NE', 'cs.RO',
  'math.CO', 'math.GT', 'math.NA', 'math.NT',
  'physics.acc-ph', 'physics.ao-ph', 'physics.atom-ph',
  'q-bio.BM', 'q-bio.CB', 'q-bio.GN',
  'stat.ML', 'stat.TH'
];