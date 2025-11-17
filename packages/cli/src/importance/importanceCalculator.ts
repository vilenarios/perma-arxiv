import axios from 'axios';
import pLimit from 'p-limit';
import { ArxivPaper } from '../types';
import { PaperImportance, ImportanceConfig, AuthorMetrics } from './types';
import logger from '../utils/logger';

export class ImportanceCalculator {
  private config: ImportanceConfig;
  private limiter: ReturnType<typeof pLimit>;
  private citationCache: Map<string, number> = new Map();
  private authorCache: Map<string, AuthorMetrics> = new Map();

  constructor(config?: Partial<ImportanceConfig>) {
    this.config = {
      minCitations: 10,
      minAuthorHIndex: 5,
      includePapersWithCode: true,
      includeConferencePapers: true,
      includeNotableAuthors: true,
      sources: [
        { name: 'citations', weight: 0.4, enabled: true },
        { name: 'author_reputation', weight: 0.2, enabled: true },
        { name: 'recency', weight: 0.1, enabled: true },
        { name: 'papers_with_code', weight: 0.2, enabled: true },
        { name: 'social_signals', weight: 0.1, enabled: true }
      ],
      ...config
    };
    this.limiter = pLimit(3);
  }

  async calculateImportance(paper: ArxivPaper): Promise<PaperImportance> {
    const importance: PaperImportance = {
      arxivId: paper.id,
      importanceScore: 0,
      lastUpdated: new Date()
    };

    const scores: { [key: string]: number } = {};

    // Get citation count from Semantic Scholar
    if (this.config.sources.find(s => s.name === 'citations')?.enabled) {
      importance.citationCount = await this.getCitationCount(paper);
      scores.citations = this.normalizeCitations(importance.citationCount);
    }

    // Calculate author reputation score
    if (this.config.sources.find(s => s.name === 'author_reputation')?.enabled) {
      const authorScore = await this.getAuthorReputationScore(paper.authors);
      importance.authorHIndex = authorScore;
      scores.author_reputation = this.normalizeAuthorScore(authorScore);
    }

    // Recency score (newer papers get slight boost)
    if (this.config.sources.find(s => s.name === 'recency')?.enabled) {
      scores.recency = this.calculateRecencyScore(paper.published);
    }

    // Check Papers with Code
    if (this.config.sources.find(s => s.name === 'papers_with_code')?.enabled) {
      const pwcData = await this.checkPapersWithCode(paper);
      importance.papersWithCodeRank = pwcData.rank;
      importance.githubStars = pwcData.stars;
      scores.papers_with_code = pwcData.score;
    }

    // Social signals (simplified - would need API keys for full implementation)
    if (this.config.sources.find(s => s.name === 'social_signals')?.enabled) {
      const socialScore = await this.getSocialSignals(paper);
      scores.social_signals = socialScore;
    }

    // Calculate weighted importance score
    importance.importanceScore = this.calculateWeightedScore(scores);

    return importance;
  }

  private async getCitationCount(paper: ArxivPaper): Promise<number> {
    // Check cache first
    if (this.citationCache.has(paper.id)) {
      return this.citationCache.get(paper.id)!;
    }

    return this.limiter(async () => {
      try {
        // Query Semantic Scholar API
        const response = await axios.get(
          `https://api.semanticscholar.org/graph/v1/paper/arXiv:${paper.id}`,
          {
            params: { fields: 'citationCount,influentialCitationCount' },
            timeout: 5000
          }
        );

        const citations = response.data.citationCount || 0;
        this.citationCache.set(paper.id, citations);

        logger.info(`Paper ${paper.id} has ${citations} citations`);
        return citations;

      } catch (error) {
        logger.warn(`Failed to get citations for ${paper.id}`, { error });
        return 0;
      }
    });
  }

  private async getAuthorReputationScore(authors: string[]): Promise<number> {
    const authorScores = await Promise.all(
      authors.slice(0, 3).map(author => this.getAuthorMetrics(author))
    );

    // Return the highest h-index among authors
    return Math.max(...authorScores.map(a => a.hIndex || 0));
  }

  private async getAuthorMetrics(authorName: string): Promise<AuthorMetrics> {
    if (this.authorCache.has(authorName)) {
      return this.authorCache.get(authorName)!;
    }

    // Simplified - in production, would query author databases
    const notableAuthors = [
      'Yann LeCun', 'Geoffrey Hinton', 'Yoshua Bengio', 'Andrew Ng',
      'Ian Goodfellow', 'Andrej Karpathy', 'Fei-Fei Li', 'Demis Hassabis'
    ];

    const metrics: AuthorMetrics = {
      name: authorName,
      isNotable: notableAuthors.some(notable =>
        authorName.toLowerCase().includes(notable.toLowerCase())
      ),
      hIndex: notableAuthors.includes(authorName) ? 100 : 10
    };

    this.authorCache.set(authorName, metrics);
    return metrics;
  }

  private calculateRecencyScore(publishedDate: string): number {
    const daysAgo = (Date.now() - new Date(publishedDate).getTime()) / (1000 * 60 * 60 * 24);

    if (daysAgo < 30) return 1.0;
    if (daysAgo < 90) return 0.8;
    if (daysAgo < 365) return 0.6;
    if (daysAgo < 730) return 0.4;
    return 0.2;
  }

  private async checkPapersWithCode(paper: ArxivPaper): Promise<{ rank?: number; stars?: number; score: number }> {
    try {
      // Check if paper exists on Papers with Code
      // const searchUrl = `https://paperswithcode.com/api/v1/papers/?arxiv_id=${paper.id}`;

      // Simplified - would need actual API implementation
      // For now, return mock data based on title keywords
      const hasImplementation = paper.title.toLowerCase().includes('implementation') ||
                               paper.title.toLowerCase().includes('code');

      return {
        rank: hasImplementation ? 10 : undefined,
        stars: hasImplementation ? 100 : undefined,
        score: hasImplementation ? 0.8 : 0.2
      };
    } catch (error) {
      return { score: 0 };
    }
  }

  private async getSocialSignals(paper: ArxivPaper): Promise<number> {
    // Simplified - would need API keys for Twitter, Reddit, HN
    // For now, use title keywords as proxy
    const buzzwords = ['transformer', 'gpt', 'llm', 'diffusion', 'neural', 'quantum'];
    const hasBuzzword = buzzwords.some(word =>
      paper.title.toLowerCase().includes(word)
    );

    return hasBuzzword ? 0.7 : 0.3;
  }

  private normalizeCitations(citations: number): number {
    if (citations >= 1000) return 1.0;
    if (citations >= 100) return 0.9;
    if (citations >= 50) return 0.8;
    if (citations >= 20) return 0.7;
    if (citations >= 10) return 0.6;
    if (citations >= 5) return 0.5;
    return citations / 10;
  }

  private normalizeAuthorScore(hIndex: number): number {
    if (hIndex >= 50) return 1.0;
    if (hIndex >= 30) return 0.8;
    if (hIndex >= 20) return 0.6;
    if (hIndex >= 10) return 0.4;
    return hIndex / 50;
  }

  private calculateWeightedScore(scores: { [key: string]: number }): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const source of this.config.sources) {
      if (source.enabled && scores[source.name] !== undefined) {
        weightedSum += scores[source.name] * source.weight;
        totalWeight += source.weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  async filterImportantPapers(papers: ArxivPaper[], minScore: number = 0.5): Promise<ArxivPaper[]> {
    const importanceData = await Promise.all(
      papers.map(paper => this.calculateImportance(paper))
    );

    const importantPapers = papers.filter((_paper, index) =>
      importanceData[index].importanceScore >= minScore ||
      (importanceData[index].citationCount || 0) >= this.config.minCitations
    );

    logger.info(`Filtered ${importantPapers.length} important papers from ${papers.length} total`);
    return importantPapers;
  }
}