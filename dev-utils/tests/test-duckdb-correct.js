const duckdb = require('duckdb');
const path = require('path');

const db = new duckdb.Database(':memory:');
const conn = db.connect();

console.log('Testing DuckDB with correct API...');

try {
  const parquetPath = path.join(__dirname, 'index', 'arxiv_index_0.parquet');
  console.log('Loading:', parquetPath);

  // Create table from Parquet - using exec for DDL
  conn.exec(`CREATE TABLE papers AS SELECT * FROM read_parquet('${parquetPath}')`, (err) => {
    if (err) {
      console.error('Error loading parquet:', err);
      return;
    }

    // Now query with callback style (correct for native duckdb)
    conn.all('SELECT COUNT(*) as count FROM papers', (err, result) => {
      if (err) {
        console.error('Count error:', err);
      } else {
        console.log('Paper count:', result[0].count);
      }
    });

    // Search with parameters
    conn.all(
      `SELECT id, title FROM papers WHERE LOWER(title) LIKE LOWER(?) LIMIT 3`,
      ['%transformer%'],
      (err, result) => {
        if (err) {
          console.error('Search error:', err);
        } else {
          console.log('Found', result.length, 'papers with "transformer"');
          result.forEach(r => console.log('-', r.title.substring(0, 80)));
        }

        conn.close();
        db.close();
      }
    );
  });

} catch (error) {
  console.error('Error:', error);
}