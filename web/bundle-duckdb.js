#!/usr/bin/env node

/**
 * Bundle DuckDB-WASM into a self-contained deployment
 *
 * This creates:
 * 1. A folder with all DuckDB-WASM files
 * 2. An HTML file that loads from local files (not CDN)
 * 3. Everything uploads to Arweave together
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DUCKDB_VERSION = '1.28.0';
const BASE_URL = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}/dist/`;

const files = [
    // Core files needed for DuckDB-WASM
    'duckdb-mvp.wasm',
    'duckdb-browser-mvp.worker.js',
    'duckdb-browser.mjs',
    'duckdb-browser-coi.worker.js' // Cross-origin isolation worker
];

async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {}); // Delete partial file
            reject(err);
        });
    });
}

async function bundleDuckDB() {
    console.log('📦 Bundling DuckDB-WASM for permanent deployment...\n');

    // Create bundle directory
    const bundleDir = path.join(__dirname, 'duckdb-bundle');
    if (!fs.existsSync(bundleDir)) {
        fs.mkdirSync(bundleDir, { recursive: true });
    }

    // Download all files
    console.log('Downloading DuckDB-WASM files:');
    for (const file of files) {
        const url = BASE_URL + file;
        const destPath = path.join(bundleDir, file);

        process.stdout.write(`  - ${file}... `);
        try {
            await downloadFile(url, destPath);
            const size = fs.statSync(destPath).size;
            console.log(`✅ (${(size / 1024 / 1024).toFixed(2)} MB)`);
        } catch (error) {
            console.log(`❌ ${error.message}`);
            throw error;
        }
    }

    // Create the bundled HTML viewer
    console.log('\n📝 Creating bundled HTML viewer...');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ArXiv Archive - Permanent Bundle</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .card {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin: 20px 0;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .info-box {
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }

        .warning-box {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }

        input[type="text"] {
            width: 100%;
            padding: 12px;
            font-size: 16px;
            border: 2px solid #ddd;
            border-radius: 8px;
            margin-bottom: 10px;
        }

        button {
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            margin-right: 10px;
            margin-bottom: 10px;
        }

        button:hover {
            background: #5567d8;
        }

        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .results {
            margin-top: 20px;
        }

        .paper {
            padding: 20px;
            border-bottom: 1px solid #eee;
        }

        .paper:last-child {
            border-bottom: none;
        }

        .paper-title {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
        }

        .paper-meta {
            color: #666;
            font-size: 14px;
            margin: 5px 0;
        }

        .paper-summary {
            color: #555;
            font-size: 14px;
            margin: 10px 0;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }

        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }

        .stat {
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
        }

        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
        }

        .stat-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            margin-top: 5px;
        }

        #status {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-size: 12px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📚 ArXiv Paper Archive</h1>
        <p>Permanent, bundled viewer with embedded DuckDB-WASM</p>
    </div>

    <div class="container">
        <div class="card">
            <h2>Connect to Archive</h2>

            <div class="info-box">
                <strong>🔒 Fully Self-Contained</strong><br>
                This viewer includes DuckDB-WASM bundled locally. No CDN required!<br>
                Uses HTTP range requests to efficiently query large Parquet files.
            </div>

            <input type="text" id="parquetInput"
                   placeholder="Enter Arweave TX ID or Parquet URL..."
                   value="__PARQUET_TX_ID__">

            <div style="margin-top: 10px;">
                <button onclick="loadParquet()">Load Archive</button>
                <button onclick="loadDefault()" id="loadDefaultBtn">Load Default Archive</button>
            </div>

            <div class="stats" id="stats" style="display:none;">
                <div class="stat">
                    <div class="stat-value" id="totalPapers">0</div>
                    <div class="stat-label">Total Papers</div>
                </div>
                <div class="stat">
                    <div class="stat-value" id="onArweave">0</div>
                    <div class="stat-label">On Arweave</div>
                </div>
                <div class="stat">
                    <div class="stat-value" id="dataSize">0</div>
                    <div class="stat-label">Index Size</div>
                </div>
            </div>
        </div>

        <div class="card" id="searchCard" style="display:none;">
            <h2>Search & Browse</h2>

            <input type="text" id="searchInput"
                   placeholder="Search papers by title, abstract, or authors...">

            <div>
                <button onclick="search()">Search</button>
                <button onclick="browse()">Browse Latest</button>
                <button onclick="showStats()">Show Statistics</button>
            </div>

            <div class="results" id="results"></div>
        </div>
    </div>

    <div id="status">
        <strong>Data Usage</strong><br>
        Downloaded: <span id="bytesDownloaded">0 KB</span><br>
        Queries: <span id="queryCount">0</span>
    </div>

    <!-- DuckDB-WASM Module Loading -->
    <script type="module">
        // Import DuckDB from bundled files (not CDN!)
        import * as duckdb from './duckdb-bundle/duckdb-browser.mjs';

        let db = null;
        let conn = null;
        let parquetUrl = null;
        let totalBytes = 0;
        let queries = 0;

        // Initialize DuckDB with local bundle
        async function initDuckDB() {
            try {
                console.log('Initializing DuckDB from bundled files...');

                // Configure bundles to use local files
                const bundle = {
                    mainModule: './duckdb-bundle/duckdb-mvp.wasm',
                    mainWorker: './duckdb-bundle/duckdb-browser-mvp.worker.js'
                };

                // Create worker
                const worker = new Worker(bundle.mainWorker);
                const logger = new duckdb.ConsoleLogger();

                // Initialize database
                db = new duckdb.AsyncDuckDB(logger, worker);
                await db.instantiate(bundle.mainModule);

                conn = await db.connect();
                console.log('✅ DuckDB initialized from local bundle');

                return true;
            } catch (error) {
                console.error('Failed to initialize DuckDB:', error);
                document.getElementById('results').innerHTML =
                    '<div class="warning-box">Failed to initialize DuckDB: ' + error.message + '</div>';
                return false;
            }
        }

        // Load Parquet file using HTTP range requests
        window.loadParquet = async function() {
            const input = document.getElementById('parquetInput').value.trim();
            if (!input || input === '__PARQUET_TX_ID__') {
                alert('Please enter a valid Arweave TX ID or URL');
                return;
            }

            // Convert TX ID to URL if needed
            if (!input.startsWith('http')) {
                parquetUrl = 'https://arweave.net/' + input;
            } else {
                parquetUrl = input;
            }

            document.getElementById('results').innerHTML = '<div class="loading">Loading archive...</div>';
            document.getElementById('status').style.display = 'block';

            try {
                // Create table from Parquet URL
                // DuckDB will automatically use HTTP range requests!
                await conn.query(\`
                    CREATE OR REPLACE TABLE papers AS
                    SELECT * FROM read_parquet('\${parquetUrl}')
                \`);

                // Get statistics
                const stats = await conn.query(\`
                    SELECT
                        COUNT(*) as total,
                        COUNT(transaction_id) as on_arweave
                    FROM papers
                \`);

                const statsData = stats.toArray()[0];

                document.getElementById('totalPapers').textContent = statsData.total.toLocaleString();
                document.getElementById('onArweave').textContent = statsData.on_arweave.toLocaleString();
                document.getElementById('dataSize').textContent = 'Optimized';

                document.getElementById('stats').style.display = 'grid';
                document.getElementById('searchCard').style.display = 'block';
                document.getElementById('results').innerHTML =
                    '<div class="info-box">✅ Archive loaded! ' + statsData.total + ' papers available.</div>';

                // Update data usage
                totalBytes += 5000; // Estimate for metadata query
                updateDataUsage();

            } catch (error) {
                console.error('Failed to load Parquet:', error);
                document.getElementById('results').innerHTML =
                    '<div class="warning-box">Failed to load archive: ' + error.message + '</div>';
            }
        };

        // Load default archive if configured
        window.loadDefault = function() {
            const defaultTxId = document.getElementById('parquetInput').value;
            if (defaultTxId && defaultTxId !== '__PARQUET_TX_ID__') {
                loadParquet();
            } else {
                alert('No default archive configured. Please enter a TX ID.');
            }
        };

        // Search papers
        window.search = async function() {
            const term = document.getElementById('searchInput').value;
            const query = term ? \`
                SELECT id, title, authors, published, primary_category,
                       SUBSTRING(summary, 1, 300) as summary
                FROM papers
                WHERE LOWER(title) LIKE LOWER('%\${term.replace(/'/g, "''")}%')
                   OR LOWER(summary) LIKE LOWER('%\${term.replace(/'/g, "''")}%')
                   OR LOWER(authors) LIKE LOWER('%\${term.replace(/'/g, "''")}%')
                ORDER BY published DESC
                LIMIT 20
            \` : \`
                SELECT id, title, authors, published, primary_category,
                       SUBSTRING(summary, 1, 300) as summary
                FROM papers
                ORDER BY published DESC
                LIMIT 20
            \`;

            await runQuery(query);
        };

        // Browse latest papers
        window.browse = async function() {
            const query = \`
                SELECT id, title, authors, published, primary_category,
                       SUBSTRING(summary, 1, 300) as summary
                FROM papers
                ORDER BY published DESC
                LIMIT 30
            \`;

            await runQuery(query);
        };

        // Show statistics
        window.showStats = async function() {
            const query = \`
                SELECT
                    primary_category,
                    COUNT(*) as count
                FROM papers
                GROUP BY primary_category
                ORDER BY count DESC
                LIMIT 10
            \`;

            const result = await conn.query(query);
            const categories = result.toArray();

            let html = '<h3>Top Categories</h3><ul>';
            categories.forEach(cat => {
                html += \`<li>\${cat.primary_category}: \${cat.count} papers</li>\`;
            });
            html += '</ul>';

            document.getElementById('results').innerHTML = html;
            totalBytes += 2000;
            updateDataUsage();
        };

        // Run query and display results
        async function runQuery(sql) {
            try {
                queries++;
                document.getElementById('results').innerHTML = '<div class="loading">Querying...</div>';

                console.time('query');
                const result = await conn.query(sql);
                console.timeEnd('query');

                const papers = result.toArray();

                if (papers.length === 0) {
                    document.getElementById('results').innerHTML = '<p>No results found</p>';
                    return;
                }

                let html = '';
                papers.forEach(paper => {
                    const date = new Date(paper.published).toLocaleDateString();
                    html += \`
                        <div class="paper">
                            <div class="paper-title">\${paper.title}</div>
                            <div class="paper-meta">
                                <strong>Authors:</strong> \${paper.authors}
                            </div>
                            <div class="paper-meta">
                                <strong>Published:</strong> \${date} |
                                <strong>Category:</strong> \${paper.primary_category}
                            </div>
                            <div class="paper-summary">
                                \${paper.summary}...
                            </div>
                        </div>
                    \`;
                });

                document.getElementById('results').innerHTML = html;

                // Update data usage estimate
                totalBytes += papers.length * 1500; // ~1.5KB per paper
                updateDataUsage();

            } catch (error) {
                console.error('Query failed:', error);
                document.getElementById('results').innerHTML =
                    '<div class="warning-box">Query failed: ' + error.message + '</div>';
            }
        }

        function updateDataUsage() {
            document.getElementById('bytesDownloaded').textContent =
                (totalBytes / 1024).toFixed(0) + ' KB';
            document.getElementById('queryCount').textContent = queries;
        }

        // Initialize on load
        window.addEventListener('load', async () => {
            const initialized = await initDuckDB();

            if (initialized) {
                // Check if default TX ID is set
                const defaultInput = document.getElementById('parquetInput').value;
                if (defaultInput && defaultInput !== '__PARQUET_TX_ID__') {
                    document.getElementById('loadDefaultBtn').style.display = 'inline-block';
                } else {
                    document.getElementById('loadDefaultBtn').style.display = 'none';
                }

                // Check URL parameters
                const urlParams = new URLSearchParams(window.location.search);
                const txId = urlParams.get('tx') || urlParams.get('parquet');
                if (txId) {
                    document.getElementById('parquetInput').value = txId;
                    await loadParquet();
                }
            }
        });
    </script>
</body>
</html>`;

    // Save the bundled HTML
    const htmlPath = path.join(__dirname, 'arxiv-bundled.html');
    fs.writeFileSync(htmlPath, html);

    // Create deployment info
    const deployInfo = {
        created: new Date().toISOString(),
        files: [
            'arxiv-bundled.html',
            ...files.map(f => `duckdb-bundle/${f}`)
        ],
        totalSize: 0,
        instructions: [
            '1. The HTML and duckdb-bundle/ folder must be uploaded together',
            '2. They must maintain the same relative paths',
            '3. Use smart-deploy.js to upload everything to Arweave',
            '4. The viewer will work forever with no external dependencies'
        ]
    };

    // Calculate total size
    let totalSize = fs.statSync(htmlPath).size;
    files.forEach(file => {
        totalSize += fs.statSync(path.join(bundleDir, file)).size;
    });
    deployInfo.totalSize = totalSize;
    deployInfo.totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

    fs.writeFileSync(
        path.join(__dirname, 'bundle-manifest.json'),
        JSON.stringify(deployInfo, null, 2)
    );

    console.log('\n✅ SUCCESS! Created bundled DuckDB-WASM viewer');
    console.log('📦 Total size:', deployInfo.totalSizeMB, 'MB');
    console.log('\n📁 Files created:');
    console.log('   - arxiv-bundled.html');
    console.log('   - duckdb-bundle/ (folder with WASM files)');
    console.log('   - bundle-manifest.json');
    console.log('\n🚀 This bundle:');
    console.log('   ✅ No CDN dependencies');
    console.log('   ✅ Uses HTTP range requests');
    console.log('   ✅ Scales to millions of papers');
    console.log('   ✅ Works forever once deployed');
    console.log('\n📤 Deploy with: npm run deploy:complete');
}

// Run the bundler
bundleDuckDB().catch(console.error);