export default function Footer() {
  return (
    <footer className="text-white mt-auto" style={{ backgroundColor: '#1a1a1a' }}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-3 text-white" style={{ fontFamily: 'var(--font-heading)' }}>
              About Permanent arXiv
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              A decentralized mirror of arXiv.org hosted permanently on the Arweave permaweb.
              All papers are stored immutably and accessible forever.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3 text-white" style={{ fontFamily: 'var(--font-heading)' }}>
              Resources
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://arxiv.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 transition-colors"
                  style={{ color: '#d1d5db' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-arxiv-pink)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}
                >
                  arXiv.org (Original)
                </a>
              </li>
              <li>
                <a
                  href="https://arweave.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 transition-colors"
                  style={{ color: '#d1d5db' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-arxiv-pink)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}
                >
                  Arweave Network
                </a>
              </li>
              <li>
                <a
                  href="https://ar.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 transition-colors"
                  style={{ color: '#d1d5db' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-arxiv-pink)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}
                >
                  AR.IO Gateway Network
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3 text-white" style={{ fontFamily: 'var(--font-heading)' }}>
              Technology
            </h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>• Hosted on Arweave permaweb</li>
              <li>• ArNS for dynamic updates</li>
              <li>• DuckDB WASM for queries</li>
              <li>• Parquet for efficient storage</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-600 mt-8 pt-6 text-center text-sm text-gray-400">
          <p>
            Papers sourced from{' '}
            <a
              href="https://arxiv.org"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-arxiv-pink)' }}
              className="hover:underline"
            >
              arXiv.org
            </a>
            {' • '}
            Made possible by{' '}
            <a
              href="https://arweave.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-arxiv-pink)' }}
              className="hover:underline"
            >
              Arweave
            </a>
          </p>
          <p className="mt-2">
            arXiv is a trademark of Cornell University. This is an independent archive project.
          </p>
        </div>
      </div>
    </footer>
  );
}
