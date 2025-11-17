import { useState } from 'react';

interface CategoryFilterProps {
  onCategorySelect: (category: string) => void;
  selectedCategory?: string;
}

// Popular arXiv categories organized by subject
const CATEGORIES = {
  'Computer Science': [
    'cs.AI', 'cs.LG', 'cs.CV', 'cs.CL', 'cs.NE', 'cs.CR', 'cs.DC', 'cs.DB',
    'cs.DS', 'cs.IR', 'cs.IT', 'cs.MA', 'cs.NI', 'cs.PL', 'cs.SE', 'cs.RO'
  ],
  'Mathematics': [
    'math.AG', 'math.AT', 'math.AP', 'math.CO', 'math.CT', 'math.FA', 'math.GM',
    'math.GR', 'math.GT', 'math.LO', 'math.NT', 'math.OA', 'math.PR', 'math.ST'
  ],
  'Physics': [
    'physics.app-ph', 'physics.ao-ph', 'physics.atm-clus', 'physics.atom-ph',
    'physics.bio-ph', 'physics.chem-ph', 'physics.comp-ph', 'physics.data-an',
    'physics.flu-dyn', 'physics.gen-ph', 'physics.geo-ph', 'physics.hist-ph',
    'physics.med-ph', 'physics.optics', 'physics.plasm-ph', 'physics.pop-ph'
  ],
  'Quantitative Biology': [
    'q-bio.BM', 'q-bio.CB', 'q-bio.GN', 'q-bio.MN', 'q-bio.NC', 'q-bio.OT',
    'q-bio.PE', 'q-bio.QM', 'q-bio.SC', 'q-bio.TO'
  ],
  'Statistics': [
    'stat.AP', 'stat.CO', 'stat.ME', 'stat.ML', 'stat.OT', 'stat.TH'
  ],
  'Electrical Engineering': [
    'eess.AS', 'eess.IV', 'eess.SP', 'eess.SY'
  ],
  'Economics': [
    'econ.EM', 'econ.GN', 'econ.TH'
  ]
};

export default function CategoryFilter({ onCategorySelect, selectedCategory }: CategoryFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-white border border-gray-300 rounded-lg font-semibold text-sm transition-colors hover:bg-gray-50"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {selectedCategory || 'Filter by Category'} ▼
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 z-20 max-h-96 overflow-y-auto"
            style={{ minWidth: '300px' }}
          >
            {/* All Papers option */}
            <button
              onClick={() => {
                onCategorySelect('');
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 font-semibold border-b border-gray-200"
              style={{
                fontFamily: 'var(--font-heading)',
                backgroundColor: !selectedCategory ? 'var(--color-arxiv-cool-bg)' : 'white'
              }}
            >
              All Papers
            </button>

            {/* Category groups */}
            {Object.entries(CATEGORIES).map(([subject, categories]) => (
              <div key={subject} className="border-b border-gray-200">
                <button
                  onClick={() => setExpandedSubject(expandedSubject === subject ? null : subject)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 font-semibold text-sm flex justify-between items-center"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {subject}
                  <span className="text-xs">{expandedSubject === subject ? '▼' : '▶'}</span>
                </button>

                {expandedSubject === subject && (
                  <div className="bg-gray-50">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => {
                          onCategorySelect(cat);
                          setIsOpen(false);
                        }}
                        className="w-full text-left px-6 py-2 text-sm hover:bg-gray-200 transition-colors"
                        style={{
                          fontFamily: 'var(--font-label)',
                          backgroundColor: selectedCategory === cat ? 'var(--color-arxiv-light-blue)' : undefined,
                          fontWeight: selectedCategory === cat ? 600 : 400
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
