export interface ParquetPaperRecord {
  _schema_version: number;
  id: string;
  version: number;
  updated: Date;
  published: Date;
  year: number;
  month: number;
  title: string;
  summary: string;
  authors: string;
  author_count: number;
  primary_category: string;
  all_categories: string;
  category_count: number;
  pdf_url: string;
  html_url: string;
  abstract_url: string;
  comment?: string;
  journal_ref?: string;
  doi?: string;
  license?: string;
  downloaded: boolean;
  download_format?: string;
  download_path?: string;
  download_date?: Date;
  file_size_mb?: number;
  word_count?: number;
  citation_count?: number;
  embedding?: Float32Array;
  transaction_id?: string;
  upload_date?: Date;
}

export interface IndexMetadata {
  created_at: Date;
  updated_at: Date;
  total_papers: number;
  total_size_gb: number;
  categories: string[];
  date_range: {
    earliest: Date;
    latest: Date;
  };
  version: string;
  parquet_files: string[];
  arweave_tx_id?: string;
}

export interface QueryOptions {
  categories?: string[];
  authors?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  searchText?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'relevance' | 'date' | 'citations';
  orderDirection?: 'asc' | 'desc';
}

export interface ArweaveConfig {
  wallet: string;
  gateway?: string;
  tags?: { name: string; value: string }[];
}

export interface IndexStats {
  papersByCategory: Map<string, number>;
  papersByYear: Map<number, number>;
  topAuthors: Array<{ name: string; count: number }>;
  downloadedCount: number;
  totalSizeGb: number;
  avgPaperSizeMb: number;
}