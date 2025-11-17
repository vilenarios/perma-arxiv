import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="text-white shadow-md" style={{ backgroundColor: 'var(--color-arxiv-red)' }}>
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
                  Permanent
                </span>
                <img
                  src="/arxiv-logo-one-color-white.svg"
                  alt="arXiv logo"
                  className="h-7"
                />
              </div>
            </Link>
            <div className="text-xs text-gray-300" style={{ fontFamily: 'var(--font-label)' }}>
              Decentralized scientific papers on Arweave
            </div>
          </div>

          <nav className="flex items-center gap-6">
            <Link
              to="/"
              className="font-semibold text-sm uppercase tracking-wide transition-opacity hover:opacity-70"
              style={{ fontFamily: 'var(--font-heading)', color: 'white', textDecoration: 'none' }}
            >
              Browse
            </Link>
            <Link
              to="/about"
              className="font-semibold text-sm uppercase tracking-wide transition-opacity hover:opacity-70"
              style={{ fontFamily: 'var(--font-heading)', color: 'white', textDecoration: 'none' }}
            >
              About
            </Link>
            <a
              href="https://github.com/vilenarios/perma-arxiv"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sm uppercase tracking-wide transition-opacity hover:opacity-70"
              style={{ fontFamily: 'var(--font-heading)', color: 'white', textDecoration: 'none' }}
            >
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
