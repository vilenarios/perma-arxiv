export interface Paper {
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
  transaction_id?: string;
  upload_date?: Date;
  upload_status?: string;
  importance_score?: number;
}

export interface SearchFilters {
  searchText: string;
  categories: string[];
  startDate?: Date;
  endDate?: Date;
  sortBy: 'published DESC' | 'published ASC' | 'title ASC';
  hasArweave?: boolean;
}

export interface DataStats {
  totalPapers: number;
  downloadedPapers: number;
  uploadedPapers: number;
}
