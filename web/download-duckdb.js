#!/usr/bin/env node

/**
 * Download DuckDB-WASM files locally to avoid CDN dependency
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DUCKDB_VERSION = '1.28.0';
const BASE_URL = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}/dist/`;

const files = [
    'duckdb-mvp.wasm',
    'duckdb-browser-mvp.worker.js',
    'duckdb-browser.mjs'
];

const libDir = path.join(__dirname, 'lib');

if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir);
}

console.log(`Downloading DuckDB-WASM v${DUCKDB_VERSION}...`);

files.forEach(file => {
    const url = BASE_URL + file;
    const dest = path.join(libDir, file);

    console.log(`Downloading ${file}...`);

    const fileStream = fs.createWriteStream(dest);
    https.get(url, (response) => {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
            fileStream.close();
            console.log(`✅ ${file}`);
        });
    });
});

console.log('\n✅ DuckDB-WASM downloaded locally');
console.log('The viewer can now work without external CDNs');