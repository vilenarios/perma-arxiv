import { ArxivPaper } from '../types';
import logger from '../utils/logger';

export interface ImportanceSignals {
  hasJournalPublication: boolean;
  isConferencePaper: boolean;
  multipleVersions: boolean;
  versionCount: number;
  isReviewOrSurvey: boolean;
  hasCodeRepository: boolean;
  authorCount: number;
  abstractLength: number;
  titleKeywords: string[];
  venuePrestige: number;
  updateFrequency: number;
  importanceScore: number;
}

export class SmartFilter {
  // High-value venues (conferences/journals)
  private readonly prestigeVenues = {
    // Top AI/ML conferences
    'neurips': 10, 'nips': 10,
    'icml': 10,
    'iclr': 10,
    'cvpr': 9,
    'iccv': 9,
    'eccv': 9,
    'aaai': 8,
    'ijcai': 8,
    'acl': 9,
    'emnlp': 8,
    'naacl': 8,

    // Top journals
    'nature': 10,
    'science': 10,
    'cell': 10,
    'pnas': 9,
    'ieee': 8,
    'jmlr': 9,
    'pami': 9,
    'tpami': 9,
    'nejm': 10,
    'lancet': 10,
    'physical review letters': 9,
    'prl': 9
  };

  // Keywords that indicate important/impactful work
  private readonly importanceKeywords = {
    'breakthrough': 5,
    'state-of-the-art': 4,
    'sota': 4,
    'novel': 3,
    'first': 3,
    'benchmark': 4,
    'outperforms': 3,
    'surpasses': 3,
    'survey': 4,
    'review': 4,
    'comprehensive': 3,
    'large-scale': 3,
    'foundation model': 5,
    'significant improvement': 4,
    'new paradigm': 4
  };

  // Papers to definitely include
  private readonly mustIncludePatterns = [
    /gpt-[4-9]/i,
    /llama\s*[3-9]/i,
    /gemini/i,
    /claude/i,
    /dall-?e\s*[3-9]/i,
    /stable\s*diffusion\s*[3-9]/i,
    /foundation\s+model/i,
    /constitutional\s+ai/i,
    /chain.?of.?thought/i,
    /attention\s+is\s+all/i,
    /transformer/i
  ];

  analyzeImportance(paper: ArxivPaper): ImportanceSignals {
    const signals: ImportanceSignals = {
      hasJournalPublication: this.hasJournalPublication(paper),
      isConferencePaper: this.isConferencePaper(paper),
      multipleVersions: paper.version > 1,
      versionCount: paper.version,
      isReviewOrSurvey: this.isReviewOrSurvey(paper),
      hasCodeRepository: this.hasCodeRepository(paper),
      authorCount: paper.authors.length,
      abstractLength: (paper.summary || '').length,
      titleKeywords: this.extractImportantKeywords(paper.title),
      venuePrestige: this.getVenuePrestige(paper),
      updateFrequency: this.calculateUpdateFrequency(paper),
      importanceScore: 0
    };

    // Calculate final score
    signals.importanceScore = this.calculateScore(signals, paper);

    return signals;
  }

  private hasJournalPublication(paper: ArxivPaper): boolean {
    if (!paper.journalRef) return false;

    const ref = paper.journalRef.toLowerCase();
    // Check for journal indicators
    return ref.includes('journal') ||
           ref.includes('transactions') ||
           ref.includes('letters') ||
           ref.includes('proceedings') ||
           ref.includes('volume') ||
           ref.includes('vol.') ||
           ref.includes('pp.') ||
           ref.includes('pages');
  }

  private isConferencePaper(paper: ArxivPaper): boolean {
    const text = `${paper.journalRef || ''} ${paper.comment || ''}`.toLowerCase();

    // Conference indicators
    const conferenceTerms = [
      'conference', 'symposium', 'workshop', 'proceedings',
      'accepted', 'to appear', 'oral', 'poster', 'spotlight'
    ];

    return conferenceTerms.some(term => text.includes(term)) ||
           Object.keys(this.prestigeVenues).some(venue => text.includes(venue));
  }

  private isReviewOrSurvey(paper: ArxivPaper): boolean {
    const titleLower = paper.title.toLowerCase();
    const abstractLower = (paper.summary || '').toLowerCase();

    const reviewTerms = [
      'survey', 'review', 'tutorial', 'overview',
      'comprehensive study', 'systematic review',
      'literature review', 'state of the art',
      'recent advances', 'progress in'
    ];

    return reviewTerms.some(term =>
      titleLower.includes(term) ||
      abstractLower.substring(0, 200).includes(term)
    );
  }

  private hasCodeRepository(paper: ArxivPaper): boolean {
    const text = `${paper.summary || ''} ${paper.comment || ''}`.toLowerCase();

    return text.includes('github.com/') ||
           text.includes('gitlab.com/') ||
           text.includes('code available') ||
           text.includes('code at') ||
           text.includes('implementation at') ||
           text.includes('repository') ||
           text.includes('open source') ||
           text.includes('opensource');
  }

  private extractImportantKeywords(title: string): string[] {
    const titleLower = title.toLowerCase();
    const found: string[] = [];

    for (const [keyword, _] of Object.entries(this.importanceKeywords)) {
      if (titleLower.includes(keyword)) {
        found.push(keyword);
      }
    }

    return found;
  }

  private getVenuePrestige(paper: ArxivPaper): number {
    const text = `${paper.journalRef || ''} ${paper.comment || ''}`.toLowerCase();

    for (const [venue, prestige] of Object.entries(this.prestigeVenues)) {
      if (text.includes(venue)) {
        return prestige;
      }
    }

    return 0;
  }

  private calculateUpdateFrequency(paper: ArxivPaper): number {
    // Papers with many versions are actively maintained
    if (paper.version >= 5) return 5;
    if (paper.version >= 3) return 3;
    if (paper.version >= 2) return 1;
    return 0;
  }

  private calculateScore(signals: ImportanceSignals, paper: ArxivPaper): number {
    let score = 0;

    // Venue prestige is most important
    score += signals.venuePrestige * 2;

    // Published papers
    if (signals.hasJournalPublication) score += 8;
    if (signals.isConferencePaper) score += 6;

    // Review papers are valuable
    if (signals.isReviewOrSurvey) score += 7;

    // Code availability
    if (signals.hasCodeRepository) score += 5;

    // Multiple versions show active research
    score += Math.min(signals.versionCount - 1, 3) * 2;

    // Title keywords
    for (const keyword of signals.titleKeywords) {
      score += this.importanceKeywords[keyword as keyof typeof this.importanceKeywords] || 0;
    }

    // Collaborative work (but not too many authors)
    if (signals.authorCount >= 3 && signals.authorCount <= 10) score += 2;
    if (signals.authorCount > 10) score += 3; // Large collaborations

    // Substantial abstract
    if (signals.abstractLength > 1000) score += 2;
    if (signals.abstractLength > 2000) score += 1;

    // Check for must-include patterns
    const titleAndAbstract = `${paper.title} ${paper.summary || ''}`;
    if (this.mustIncludePatterns.some(pattern => pattern.test(titleAndAbstract))) {
      score += 10;
    }

    // Recent papers get a small boost
    const daysOld = (Date.now() - new Date(paper.published).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld <= 7) score += 3;
    else if (daysOld <= 30) score += 2;
    else if (daysOld <= 90) score += 1;

    return score;
  }

  filterImportantPapers(
    papers: ArxivPaper[],
    minScore: number = 10,
    maxPapers?: number
  ): ArxivPaper[] {
    // Analyze all papers
    const analyzed = papers.map(paper => ({
      paper,
      signals: this.analyzeImportance(paper)
    }));

    // Sort by importance score
    analyzed.sort((a, b) => b.signals.importanceScore - a.signals.importanceScore);

    // Filter by minimum score
    let filtered = analyzed.filter(a => a.signals.importanceScore >= minScore);

    // Limit number if specified
    if (maxPapers && filtered.length > maxPapers) {
      filtered = filtered.slice(0, maxPapers);
    }

    // Log statistics
    logger.info('Paper importance analysis:', {
      total: papers.length,
      aboveThreshold: filtered.length,
      topScore: analyzed[0]?.signals.importanceScore || 0,
      threshold: minScore
    });

    // Return just the papers
    return filtered.map(a => a.paper);
  }

  // Get papers by specific criteria
  getConferencePapers(papers: ArxivPaper[]): ArxivPaper[] {
    return papers.filter(p => this.isConferencePaper(p));
  }

  getJournalPapers(papers: ArxivPaper[]): ArxivPaper[] {
    return papers.filter(p => this.hasJournalPublication(p));
  }

  getSurveyPapers(papers: ArxivPaper[]): ArxivPaper[] {
    return papers.filter(p => this.isReviewOrSurvey(p));
  }

  getPapersWithCode(papers: ArxivPaper[]): ArxivPaper[] {
    return papers.filter(p => this.hasCodeRepository(p));
  }
}