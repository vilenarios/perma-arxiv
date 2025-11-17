interface StatsDisplayProps {
  stats: {
    totalPapers: number;
    categories: Array<{ category: string; count: number }>;
    dateRange: { earliest: Date; latest: Date };
  };
}

export default function StatsDisplay({ stats }: StatsDisplayProps) {
  const formatNumber = (num: number) => {
    return num.toLocaleString('en-US');
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <h2 className="text-2xl font-heading font-semibold text-arxiv-grey mb-6">
        Archive Statistics
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="text-center p-4 bg-arxiv-warm-bg rounded-lg">
          <div className="text-4xl font-heading font-bold text-arxiv-blue mb-2">
            {formatNumber(stats.totalPapers)}
          </div>
          <div className="text-sm font-label uppercase tracking-wide text-gray-600">
            Total Papers
          </div>
        </div>

        <div className="text-center p-4 bg-arxiv-warm-bg rounded-lg">
          <div className="text-4xl font-heading font-bold text-arxiv-blue mb-2">
            {formatDate(stats.dateRange.earliest)}
          </div>
          <div className="text-sm font-label uppercase tracking-wide text-gray-600">
            Earliest Paper
          </div>
        </div>

        <div className="text-center p-4 bg-arxiv-warm-bg rounded-lg">
          <div className="text-4xl font-heading font-bold text-arxiv-blue mb-2">
            {formatDate(stats.dateRange.latest)}
          </div>
          <div className="text-sm font-label uppercase tracking-wide text-gray-600">
            Latest Paper
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-heading font-semibold text-arxiv-grey mb-3">
          Top Categories
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {stats.categories.slice(0, 10).map((cat, idx) => (
            <div
              key={idx}
              className="bg-arxiv-cool-bg border border-gray-200 rounded px-3 py-2 text-center"
            >
              <div className="text-sm font-label font-semibold text-arxiv-blue">
                {cat.category}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {formatNumber(cat.count)} papers
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
