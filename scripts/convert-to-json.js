#!/usr/bin/env node

/**
 * Convert Parquet files to JSON for the standalone web viewer
 */

const duckdb = require('duckdb');
const fs = require('fs');
const path = require('path');

const indexDir = path.join(__dirname, '..', 'index');
const outputDir = path.join(__dirname, '..', 'web');

console.log('Converting Parquet to JSON...\n');

// Find Parquet files
const files = fs.readdirSync(indexDir);
const parquetFiles = files.filter(f => f.endsWith('.parquet') && !f.startsWith('backup_'));

if (parquetFiles.length === 0) {
    console.error('No Parquet files found in index directory');
    process.exit(1);
}

const db = new duckdb.Database(':memory:');
const conn = db.connect();

parquetFiles.forEach(file => {
    const inputPath = path.join(indexDir, file);
    const outputName = file.replace('.parquet', '.json');
    const outputPath = path.join(outputDir, outputName);

    console.log(`Converting ${file}...`);

    conn.exec(`
        COPY (
            SELECT * FROM read_parquet('${inputPath.replace(/\\/g, '/')}')
        ) TO '${outputPath.replace(/\\/g, '/')}'
        (FORMAT JSON, ARRAY true)
    `, (err) => {
        if (err) {
            console.error(`Error converting ${file}:`, err);
        } else {
            const stats = fs.statSync(outputPath);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`✅ Created ${outputName} (${sizeMB} MB)`);
        }
    });
});

setTimeout(() => {
    conn.close();
    db.close();
    console.log('\n✅ Conversion complete!');
    console.log('\nYou can now:');
    console.log('1. Open web/arxiv-viewer-standalone.html');
    console.log(`2. Load ${parquetFiles[0].replace('.parquet', '.json')}`);
}, 2000);