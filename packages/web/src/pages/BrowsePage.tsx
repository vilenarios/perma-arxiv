import { useState, useEffect } from 'react';
import type { Paper } from '../types/paper';
import { queryPapers, getStats } from '../lib/duckdb';
import PaperCard from '../components/papers/PaperCard';
import SearchBar from '../components/search/SearchBar';
import StatsDisplay from '../components/stats/StatsDisplay';

export default function BrowsePage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [stats, setStats] = useState<{
    totalPapers: number;
    categories: Array<{ category: string; count: number }>;
    dateRange: { earliest: Date; latest: Date };
  } | null>(null);

  useEffect(() => {
    loadStats();
    loadPapers();
  }, []);

  const loadStats = async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadPapers = async (search: string = '') => {
    setLoading(true);
    setError(null);
    try {
      const results = await queryPapers(search, [], undefined, undefined, 'published DESC', 100, 0);
      setPapers(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load papers');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchText(text);
    loadPapers(text);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Stats Section */}
      {stats && <StatsDisplay stats={stats} />}

      {/* Search Section */}
      <div className="mb-8">
        <SearchBar onSearch={handleSearch} />
      </div>

      {/* Results Section */}
      <div className="mb-6">
        <h2 className="text-2xl font-heading font-semibold text-arxiv-grey">
          {searchText ? `Search Results for "${searchText}"` : 'Recent Papers'}
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Showing {papers.length} {papers.length === 1 ? 'paper' : 'papers'}
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-arxiv-blue"></div>
          <p className="mt-4 text-arxiv-grey">Loading papers...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-800 font-semibold">Error loading papers</p>
          <p className="text-red-600 text-sm mt-2">{error}</p>
        </div>
      )}

      {/* Papers List */}
      {!loading && !error && (
        <div className="space-y-4">
          {papers.map((paper) => (
            <PaperCard key={paper.id} paper={paper} />
          ))}

          {papers.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-600">No papers found</p>
              <p className="text-sm text-gray-500 mt-2">Try adjusting your search criteria</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
