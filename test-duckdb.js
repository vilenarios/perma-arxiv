const duckdb = require('duckdb');
const path = require('path');

const db = new duckdb.Database(':memory:');
const conn = db.connect();

console.log('Testing DuckDB with Parquet...');

try {
  // Try to load the Parquet file
  const parquetPath = path.join(__dirname, 'index', 'arxiv_index_0.parquet');
  console.log('Loading:', parquetPath);

  // Create table from Parquet
  conn.exec(`CREATE TABLE papers AS SELECT * FROM read_parquet('${parquetPath}')`);

  // Check count
  const countStmt = conn.prepare('SELECT COUNT(*) as count FROM papers');
  const countResult = countStmt.all();
  console.log('Paper count:', countResult);

  // Test search
  const searchStmt = conn.prepare(`
    SELECT id, title
    FROM papers
    WHERE LOWER(title) LIKE LOWER(?)
    LIMIT 3
  `);
  const searchResult = searchStmt.all('%transformer%');

  console.log('Search results:', searchResult);

} catch (error) {
  console.error('Error:', error);
} finally {
  conn.close();
  db.close();
}