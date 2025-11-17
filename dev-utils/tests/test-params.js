const duckdb = require('duckdb');
const path = require('path');

const db = new duckdb.Database(':memory:');
const conn = db.connect();

const parquetPath = path.join(__dirname, 'index', 'arxiv_index_0.parquet');

conn.exec(`CREATE TABLE papers AS SELECT * FROM read_parquet('${parquetPath}')`, (err) => {
  if (err) {
    console.error('Error:', err);
    return;
  }

  // Test different parameter styles
  console.log('Testing parameter styles...');

  // Test 1: Without parameters (works)
  conn.all(
    `SELECT id, title FROM papers WHERE LOWER(title) LIKE '%transformer%' LIMIT 3`,
    (err, result) => {
      if (err) console.error('Test 1 error:', err);
      else console.log('Test 1 success:', result.length, 'papers found');
    }
  );

  // Test 2: With $ parameters
  conn.all(
    `SELECT id, title FROM papers WHERE LOWER(title) LIKE LOWER($1) LIMIT $2`,
    '%transformer%', 3,
    (err, result) => {
      if (err) console.error('Test 2 error:', err);
      else console.log('Test 2 success:', result.length, 'papers found');
    }
  );

  // Test 3: Build SQL directly (workaround)
  const searchTerm = '%transformer%';
  const limit = 3;
  const sql = `SELECT id, title FROM papers WHERE LOWER(title) LIKE LOWER('${searchTerm}') LIMIT ${limit}`;

  conn.all(sql, (err, result) => {
    if (err) console.error('Test 3 error:', err);
    else console.log('Test 3 success:', result.length, 'papers found');

    conn.close();
    db.close();
  });
});