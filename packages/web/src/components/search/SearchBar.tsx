import { useState, type FormEvent } from 'react';
import CategoryFilter from './CategoryFilter';

interface SearchBarProps {
  onSearch: (searchText: string) => void;
}

export default function SearchBar({ onSearch }: SearchBarProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(searchText);
  };

  const handleClear = () => {
    setSearchText('');
    onSearch('');
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    if (category) {
      setSearchText(category);
      onSearch(category);
    } else {
      setSearchText('');
      onSearch('');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex gap-3 mb-4">
        <CategoryFilter
          onCategorySelect={handleCategorySelect}
          selectedCategory={selectedCategory}
        />
        {selectedCategory && (
          <button
            onClick={() => handleCategorySelect('')}
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors"
            style={{
              fontFamily: 'var(--font-label)',
              backgroundColor: 'var(--color-arxiv-pink)',
              color: 'white'
            }}
          >
            Clear Filter ✕
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search papers by title, abstract, or authors..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-arxiv-blue focus:border-transparent font-body text-base"
          />
          {searchText && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Clear search"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <button
          type="submit"
          className="arxiv-button arxiv-button-primary px-8"
        >
          Search
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="text-sm text-gray-600" style={{ fontFamily: 'var(--font-label)' }}>Quick filters:</span>
        {['cs.AI', 'cs.LG', 'cs.CV', 'cs.CL', 'math.CO', 'physics.gen-ph'].map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => {
              setSearchText(cat);
              onSearch(cat);
            }}
            className="text-xs font-semibold px-3 py-1 rounded transition-colors"
            style={{
              fontFamily: 'var(--font-label)',
              backgroundColor: 'var(--color-arxiv-cool-bg)',
              color: 'var(--color-arxiv-grey)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-arxiv-blue)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-arxiv-cool-bg)';
              e.currentTarget.style.color = 'var(--color-arxiv-grey)';
            }}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  );
}
