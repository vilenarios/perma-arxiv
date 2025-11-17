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
export const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || './data/downloads';
export const DB_PATH = process.env.DB_PATH || './data/arxiv.db';

export const USER_AGENT = process.env.USER_AGENT || 'ArxivScraper/1.0.0 (https://github.com/vilenarios/perma-arxiv)';

// Comprehensive ArXiv category list
export const ALL_CATEGORIES = [
  // Computer Science
  'cs.AI', 'cs.AR', 'cs.CC', 'cs.CE', 'cs.CG', 'cs.CL', 'cs.CR', 'cs.CV', 'cs.CY', 'cs.DB',
  'cs.DC', 'cs.DL', 'cs.DM', 'cs.DS', 'cs.ET', 'cs.FL', 'cs.GL', 'cs.GR', 'cs.GT', 'cs.HC',
  'cs.IR', 'cs.IT', 'cs.LG', 'cs.LO', 'cs.MA', 'cs.MM', 'cs.MS', 'cs.NA', 'cs.NE', 'cs.NI',
  'cs.OH', 'cs.OS', 'cs.PF', 'cs.PL', 'cs.RO', 'cs.SC', 'cs.SD', 'cs.SE', 'cs.SI', 'cs.SY',
  // Economics
  'econ.EM', 'econ.GN', 'econ.TH',
  // Electrical Engineering and Systems Science
  'eess.AS', 'eess.IV', 'eess.SP', 'eess.SY',
  // Mathematics
  'math.AC', 'math.AG', 'math.AP', 'math.AT', 'math.CA', 'math.CO', 'math.CT', 'math.CV',
  'math.DG', 'math.DS', 'math.FA', 'math.GM', 'math.GN', 'math.GR', 'math.GT', 'math.HO',
  'math.IT', 'math.KT', 'math.LO', 'math.MG', 'math.MP', 'math.NA', 'math.NT', 'math.OA',
  'math.OC', 'math.PR', 'math.QA', 'math.RA', 'math.RT', 'math.SG', 'math.SP', 'math.ST',
  // Physics
  'astro-ph.CO', 'astro-ph.EP', 'astro-ph.GA', 'astro-ph.HE', 'astro-ph.IM', 'astro-ph.SR',
  'cond-mat.dis-nn', 'cond-mat.mes-hall', 'cond-mat.mtrl-sci', 'cond-mat.other', 'cond-mat.quant-gas',
  'cond-mat.soft', 'cond-mat.stat-mech', 'cond-mat.str-el', 'cond-mat.supr-con',
  'gr-qc', 'hep-ex', 'hep-lat', 'hep-ph', 'hep-th', 'math-ph', 'nlin.AO', 'nlin.CD', 'nlin.CG',
  'nlin.PS', 'nlin.SI', 'nucl-ex', 'nucl-th', 'physics.acc-ph', 'physics.ao-ph', 'physics.app-ph',
  'physics.atm-clus', 'physics.atom-ph', 'physics.bio-ph', 'physics.chem-ph', 'physics.class-ph',
  'physics.comp-ph', 'physics.data-an', 'physics.ed-ph', 'physics.flu-dyn', 'physics.gen-ph',
  'physics.geo-ph', 'physics.hist-ph', 'physics.ins-det', 'physics.med-ph', 'physics.optics',
  'physics.plasm-ph', 'physics.pop-ph', 'physics.soc-ph', 'physics.space-ph', 'quant-ph',
  // Quantitative Biology
  'q-bio.BM', 'q-bio.CB', 'q-bio.GN', 'q-bio.MN', 'q-bio.NC', 'q-bio.OT', 'q-bio.PE', 'q-bio.QM',
  'q-bio.SC', 'q-bio.TO',
  // Quantitative Finance
  'q-fin.CP', 'q-fin.EC', 'q-fin.GN', 'q-fin.MF', 'q-fin.PM', 'q-fin.PR', 'q-fin.RM', 'q-fin.ST',
  'q-fin.TR',
  // Statistics
  'stat.AP', 'stat.CO', 'stat.ME', 'stat.ML', 'stat.OT', 'stat.TH'
];

// Default categories for standard scraping (focused on AI/ML)
export const CATEGORIES = [
  'cs.AI', 'cs.CL', 'cs.CV', 'cs.LG', 'cs.NE', 'cs.RO',
  'stat.ML', 'stat.TH'
];

// ArNS (Arweave Name System) Configuration
export const ARNS_NAME_MAIN = process.env.ARNS_NAME_MAIN || 'arxiv';
export const ARNS_NAME_DATA = process.env.ARNS_NAME_DATA || 'data_arxiv';
export const ANT_PROCESS_ID_MAIN = process.env.ANT_PROCESS_ID_MAIN;
export const ANT_PROCESS_ID_DATA = process.env.ANT_PROCESS_ID_DATA;
export const ARNS_TTL_SECONDS = parseInt(process.env.ARNS_TTL_SECONDS || '60');