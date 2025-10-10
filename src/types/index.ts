export interface ArxivPaper {
  id: string;
  updated: string;
  published: string;
  title: string;
  summary: string;
  authors: string[];
  categories: string[];
  pdfUrl: string;
  htmlUrl: string;
  abstractUrl: string;
  version: number;
  comment?: string;
  journalRef?: string;
  doi?: string;
  license?: string;
}

export interface ArxivQueryParams {
  searchQuery?: string;
  idList?: string[];
  start?: number;
  maxResults?: number;
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder?: 'ascending' | 'descending';
}

export interface ScrapeProgress {
  totalPapers: number;
  downloadedPapers: number;
  failedDownloads: number;
  lastSyncTime?: Date;
}

export interface RateLimitOptions {
  maxConcurrent: number;
  requestsPerSecond: number;
  retryAttempts: number;
  retryDelay: number;
}