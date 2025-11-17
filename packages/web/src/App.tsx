import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import BrowsePage from './pages/BrowsePage';
import AboutPage from './pages/AboutPage';
import { initializeDuckDB, loadParquetFile } from './lib/duckdb';
import { getDataUrl } from './lib/gateway';
import { registerServiceWorker } from './registerSW';

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initialize() {
      try {
        // Register service worker first for COOP/COEP headers
        console.log('Registering Service Worker...');
        await registerServiceWorker();

        console.log('Initializing DuckDB...');
        await initializeDuckDB();

        console.log('Loading data from ArNS...');
        const dataUrl = getDataUrl();
        const response = await fetch(dataUrl);

        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.statusText}`);
        }

        const blob = await response.blob();
        const file = new File([blob], 'arxiv.parquet', { type: 'application/octet-stream' });
        await loadParquetFile(file);

        console.log('Initialization complete');
        setIsInitializing(false);
      } catch (err) {
        console.error('Initialization error:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize application');
        setIsInitializing(false);
      }
    }

    initialize();
  }, []);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-arxiv-warm-bg flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-arxiv-blue mb-4"></div>
          <h2 className="text-2xl font-heading font-semibold text-arxiv-grey">
            Loading Permanent arXiv
          </h2>
          <p className="text-gray-600 mt-2">Initializing database and loading data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-arxiv-warm-bg flex items-center justify-center">
        <div className="max-w-lg bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-heading font-semibold text-arxiv-grey mb-4">
            Initialization Error
          </h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="arxiv-button arxiv-button-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<BrowsePage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
