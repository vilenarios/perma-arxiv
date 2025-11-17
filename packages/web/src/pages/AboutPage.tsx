export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-heading font-bold text-arxiv-grey mb-6">
        About Permanent arXiv
      </h1>

      <div className="prose prose-lg max-w-none">
        <section className="bg-white rounded-lg shadow-sm p-8 mb-6">
          <h2 className="text-2xl font-heading font-semibold text-arxiv-grey mb-4">
            What is Permanent arXiv?
          </h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            Permanent arXiv is a decentralized mirror of scientific papers from{' '}
            <a href="https://arxiv.org" target="_blank" rel="noopener noreferrer" className="text-arxiv-link hover:underline">
              arXiv.org
            </a>
            , hosted permanently on the Arweave permaweb. All papers are stored immutably and will be
            accessible forever, ensuring that scientific knowledge remains available to future generations.
          </p>
          <p className="text-gray-700 leading-relaxed">
            Unlike traditional web hosting, Arweave uses a blockchain-based storage system that guarantees
            permanent data availability through economic incentives. Once uploaded, papers cannot be deleted
            or modified, creating a truly permanent archive.
          </p>
        </section>

        <section className="bg-white rounded-lg shadow-sm p-8 mb-6">
          <h2 className="text-2xl font-heading font-semibold text-arxiv-grey mb-4">
            Technology Stack
          </h2>
          <ul className="space-y-3 text-gray-700">
            <li>
              <strong className="text-arxiv-grey">Arweave:</strong> Permanent, decentralized storage network
            </li>
            <li>
              <strong className="text-arxiv-grey">ArNS:</strong> Arweave Name System for human-readable URLs and dynamic updates
            </li>
            <li>
              <strong className="text-arxiv-grey">DuckDB WASM:</strong> In-browser database for fast querying
            </li>
            <li>
              <strong className="text-arxiv-grey">Parquet:</strong> Columnar storage format for efficient data access
            </li>
            <li>
              <strong className="text-arxiv-grey">React:</strong> Modern UI framework for responsive interface
            </li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow-sm p-8 mb-6">
          <h2 className="text-2xl font-heading font-semibold text-arxiv-grey mb-4">
            Features
          </h2>
          <ul className="space-y-3 text-gray-700">
            <li>🔍 <strong>Full-text search</strong> across titles, abstracts, and authors</li>
            <li>📊 <strong>Category filtering</strong> across 155+ arXiv categories</li>
            <li>🎯 <strong>Importance scoring</strong> based on conferences, citations, and code availability</li>
            <li>📱 <strong>Responsive design</strong> works on desktop and mobile devices</li>
            <li>⚡ <strong>Fast queries</strong> powered by DuckDB WASM</li>
            <li>🌐 <strong>Gateway network</strong> served by multiple AR.IO gateways worldwide</li>
            <li>♾️ <strong>Permanent storage</strong> guaranteed by Arweave blockchain</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow-sm p-8 mb-6">
          <h2 className="text-2xl font-heading font-semibold text-arxiv-grey mb-4">
            Open Source
          </h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            This project is open source and available on GitHub. Contributions are welcome!
          </p>
          <a
            href="https://github.com/vilenarios/perma-arxiv"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block arxiv-button arxiv-button-primary"
          >
            View on GitHub
          </a>
        </section>

        <section className="bg-arxiv-cool-bg rounded-lg border-l-4 border-arxiv-blue p-6">
          <p className="text-sm text-gray-600">
            <strong>Disclaimer:</strong> arXiv is a trademark of Cornell University. Permanent arXiv is an
            independent archive project not affiliated with or endorsed by Cornell University or arXiv.org.
            All papers are sourced from the public arXiv API and retain their original licenses.
          </p>
        </section>
      </div>
    </div>
  );
}
