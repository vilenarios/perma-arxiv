import type { Paper } from '../../types/paper';
import { getTransactionUrl } from '../../lib/gateway';

interface PaperCardProps {
  paper: Paper;
}

export default function PaperCard({ paper }: PaperCardProps) {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getAuthorsDisplay = (authors: string) => {
    const authorList = authors.split(',').map(a => a.trim());
    if (authorList.length > 3) {
      return `${authorList.slice(0, 3).join(', ')}, et al.`;
    }
    return authorList.join(', ');
  };

  const categories = paper.all_categories.split(' ').filter(c => c.trim());
  const primaryCategory = paper.primary_category;

  return (
    <article className="paper-card">
      {/* Header with categories and date */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex flex-wrap gap-2">
          <span
            className="category-tag text-white"
            style={{ backgroundColor: 'var(--color-arxiv-blue)' }}
          >
            {primaryCategory}
          </span>
          {categories.slice(0, 3).map((cat, idx) =>
            cat !== primaryCategory && (
              <span key={idx} className="category-tag bg-gray-200 text-gray-700">
                {cat}
              </span>
            )
          )}
        </div>
        <time className="text-sm text-gray-500 ml-4 flex-shrink-0" style={{ fontFamily: 'var(--font-label)' }}>
          {formatDate(paper.published)}
        </time>
      </div>

      {/* Title */}
      <h3
        className="text-xl font-semibold mb-2 leading-tight"
        style={{
          fontFamily: 'var(--font-heading)',
          color: 'var(--color-arxiv-grey)',
        }}
      >
        {paper.title}
      </h3>

      {/* Authors */}
      <p className="text-sm text-gray-600 mb-3" style={{ fontFamily: 'var(--font-label)' }}>
        {getAuthorsDisplay(paper.authors)}
      </p>

      {/* Abstract preview */}
      <p className="text-sm text-gray-700 leading-relaxed mb-4 line-clamp-3">
        {paper.summary}
      </p>

      {/* Footer with links */}
      <div className="flex items-center gap-4 pt-3 border-t border-gray-200">
        {/* Primary link: Arweave version if uploaded, otherwise arXiv */}
        {paper.transaction_id ? (
          <>
            <a
              href={getTransactionUrl(paper.transaction_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold transition-colors"
              style={{
                fontFamily: 'var(--font-label)',
                color: 'var(--color-arxiv-link)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-arxiv-pink)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-arxiv-link)'}
            >
              {paper.download_format === 'html' ? '📄 View Paper (HTML)' : '📄 View Paper (PDF)'} →
            </a>

            {/* Show arXiv as secondary reference */}
            <a
              href={paper.abstract_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold transition-colors"
              style={{
                fontFamily: 'var(--font-label)',
                color: 'var(--color-arxiv-grey)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-arxiv-link)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-arxiv-grey)'}
            >
              arXiv.org ↗
            </a>
          </>
        ) : (
          <>
            {/* Not uploaded yet - link to arXiv */}
            <a
              href={paper.abstract_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold transition-colors"
              style={{
                fontFamily: 'var(--font-label)',
                color: 'var(--color-arxiv-link)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-arxiv-pink)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-arxiv-link)'}
            >
              View on arXiv.org →
            </a>
            <span className="text-xs text-gray-500" style={{ fontFamily: 'var(--font-label)' }}>
              (Not yet on Arweave)
            </span>
          </>
        )}

        {paper.importance_score !== undefined && paper.importance_score > 0 && (
          <span
            className="ml-auto text-xs font-semibold px-2 py-1 rounded"
            style={{
              fontFamily: 'var(--font-label)',
              color: 'var(--color-arxiv-blue)',
              backgroundColor: 'var(--color-arxiv-light-blue)',
            }}
          >
            Score: {paper.importance_score}
          </span>
        )}
      </div>
    </article>
  );
}
