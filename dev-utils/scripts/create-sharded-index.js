#!/usr/bin/env node

/**
 * Create sharded Parquet files for efficient querying
 * Instead of one 500MB file, create multiple smaller files
 */

const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs');

const db = new duckdb.Database(':memory:');
const conn = db.connect();

async function createShardedIndex() {
    console.log('Creating sharded Parquet index for efficient web queries...\n');

    const indexDir = path.join(__dirname, '..', 'index');
    const shardDir = path.join(indexDir, 'shards');

    if (!fs.existsSync(shardDir)) {
        fs.mkdirSync(shardDir, { recursive: true });
    }

    // Load main Parquet file
    const mainFile = path.join(indexDir, 'arxiv_index_0.parquet');

    conn.exec(`CREATE TABLE papers AS SELECT * FROM read_parquet('${mainFile}')`, (err) => {
        if (err) {
            console.error('Error loading main file:', err);
            return;
        }

        // Strategy 1: Create a small metadata file (just essential fields)
        console.log('Creating metadata shard (minimal data for browsing)...');
        conn.exec(`
            COPY (
                SELECT id, title, authors, primary_category, published, year,
                       transaction_id, SUBSTRING(summary, 1, 200) as summary_preview
                FROM papers
                ORDER BY published DESC
            ) TO '${path.join(shardDir, 'metadata.parquet')}'
            (FORMAT PARQUET, COMPRESSION ZSTD)
        `, (err) => {
            if (err) console.error(err);
            else console.log('✅ Created metadata.parquet (small, for quick browsing)');
        });

        // Strategy 2: Create yearly shards
        console.log('\nCreating yearly shards...');
        conn.all('SELECT DISTINCT year FROM papers ORDER BY year DESC', (err, years) => {
            if (err) {
                console.error(err);
                return;
            }

            years.forEach(row => {
                const year = row.year;
                conn.exec(`
                    COPY (
                        SELECT * FROM papers WHERE year = ${year}
                    ) TO '${path.join(shardDir, `year_${year}.parquet`)}'
                    (FORMAT PARQUET, COMPRESSION ZSTD)
                `, (err) => {
                    if (err) console.error(err);
                    else console.log(`✅ Created year_${year}.parquet`);
                });
            });
        });

        // Strategy 3: Create category shards
        console.log('\nCreating category shards...');
        conn.all('SELECT DISTINCT primary_category FROM papers', (err, categories) => {
            if (err) {
                console.error(err);
                return;
            }

            categories.slice(0, 10).forEach(row => { // Top 10 categories
                const category = row.primary_category.replace(/\./g, '_');
                conn.exec(`
                    COPY (
                        SELECT * FROM papers WHERE primary_category = '${row.primary_category}'
                    ) TO '${path.join(shardDir, `cat_${category}.parquet`)}'
                    (FORMAT PARQUET, COMPRESSION ZSTD)
                `, (err) => {
                    if (err) console.error(err);
                    else console.log(`✅ Created cat_${category}.parquet`);
                });
            });
        });

        // Strategy 4: Create a search index (just searchable fields)
        console.log('\nCreating search index...');
        conn.exec(`
            COPY (
                SELECT id, title, authors, summary, primary_category
                FROM papers
            ) TO '${path.join(shardDir, 'search_index.parquet')}'
            (FORMAT PARQUET, COMPRESSION ZSTD)
        `, (err) => {
            if (err) console.error(err);
            else console.log('✅ Created search_index.parquet');
        });

        // Create manifest
        setTimeout(() => {
            const files = fs.readdirSync(shardDir).filter(f => f.endsWith('.parquet'));
            const manifest = {
                created: new Date().toISOString(),
                shards: files.map(f => {
                    const stats = fs.statSync(path.join(shardDir, f));
                    return {
                        file: f,
                        size: stats.size,
                        sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
                    };
                }),
                totalSize: files.reduce((sum, f) => {
                    const stats = fs.statSync(path.join(shardDir, f));
                    return sum + stats.size;
                }, 0)
            };

            fs.writeFileSync(
                path.join(shardDir, 'manifest.json'),
                JSON.stringify(manifest, null, 2)
            );

            console.log('\n✅ Sharding complete!');
            console.log(`Created ${files.length} shard files`);
            console.log(`Total size: ${(manifest.totalSize / (1024 * 1024)).toFixed(2)} MB`);
            console.log('\nUse cases:');
            console.log('  - metadata.parquet: Quick browsing (smallest)');
            console.log('  - year_*.parquet: Browse by year');
            console.log('  - cat_*.parquet: Browse by category');
            console.log('  - search_index.parquet: Full-text search');

            conn.close();
            db.close();
        }, 3000);
    });
}

createShardedIndex();