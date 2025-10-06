export interface PaperImportance {
  arxivId: string;
  citationCount?: number;
  semanticScholarId?: string;
  githubStars?: number;
  twitterMentions?: number;
  redditScore?: number;
  hackerNewsPoints?: number;
  papersWithCodeRank?: number;
  conferenceAccepted?: string;
  authorHIndex?: number;
  importanceScore: number;
  lastUpdated: Date;
}

export interface ImportanceSource {
  name: string;
  weight: number;
  enabled: boolean;
}

export interface CuratedList {
  name: string;
  url: string;
  description: string;
  papers: string[];
  lastUpdated: Date;
}

export interface AuthorMetrics {
  name: string;
  hIndex?: number;
  citationCount?: number;
  paperCount?: number;
  affiliations?: string[];
  isNotable: boolean;
}

export interface ImportanceConfig {
  minCitations: number;
  minAuthorHIndex: number;
  includePapersWithCode: boolean;
  includeConferencePapers: boolean;
  includeNotableAuthors: boolean;
  sources: ImportanceSource[];
}