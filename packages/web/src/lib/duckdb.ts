import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import type { Paper } from '../types/paper';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

export async function initializeDuckDB(): Promise<void> {
  if (db) return; // Already initialized

  const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
      mainModule: duckdb_wasm,
      mainWorker: new URL('@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js', import.meta.url).toString(),
    },
    eh: {
      mainModule: duckdb_wasm_eh,
      mainWorker: new URL('@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js', import.meta.url).toString(),
    },
  };

  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  conn = await db.connect();

  console.log('DuckDB initialized successfully');
}

export async function loadParquetFile(file: File): Promise<void> {
  if (!db || !conn) {
    throw new Error('DuckDB not initialized. Call initializeDuckDB() first.');
  }

  // Register the file
  await db.registerFileHandle(file.name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);

  // Create view from parquet file
  await conn.query(`
    CREATE OR REPLACE VIEW papers AS
    SELECT * FROM read_parquet('${file.name}')
  `);

  console.log('Parquet file loaded successfully');
}

export async function queryPapers(
  searchText: string = '',
  categories: string[] = [],
  startDate?: Date,
  endDate?: Date,
  sortBy: string = 'published DESC',
  limit: number = 1000,
  offset: number = 0
): Promise<Paper[]> {
  if (!conn) {
    throw new Error('DuckDB not initialized');
  }

  const conditions: string[] = [];

  if (searchText.trim()) {
    const searchLower = searchText.toLowerCase();
    conditions.push(`(
      LOWER(title) LIKE '%${searchLower}%' OR
      LOWER(summary) LIKE '%${searchLower}%' OR
      LOWER(authors) LIKE '%${searchLower}%'
    )`);
  }

  if (categories.length > 0) {
    const categoryConditions = categories.map(cat =>
      `(LOWER(all_categories) LIKE '%${cat.toLowerCase()}%')`
    ).join(' OR ');
    conditions.push(`(${categoryConditions})`);
  }

  if (startDate) {
    const startStr = startDate.toISOString().split('T')[0];
    conditions.push(`published >= '${startStr}'`);
  }

  if (endDate) {
    const endStr = endDate.toISOString().split('T')[0];
    conditions.push(`published <= '${endStr}'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT * FROM papers
    ${whereClause}
    ORDER BY ${sortBy}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const result = await conn.query(query);
  return result.toArray().map((row: any) => ({
    id: row.id,
    version: row.version || 1,
    updated: new Date(row.updated),
    published: new Date(row.published),
    year: row.year || new Date(row.published).getFullYear(),
    month: row.month || new Date(row.published).getMonth() + 1,
    title: row.title,
    summary: row.summary,
    authors: row.authors,
    author_count: row.author_count || 0,
    primary_category: row.primary_category,
    all_categories: row.all_categories,
    category_count: row.category_count || 0,
    pdf_url: row.pdf_url,
    html_url: row.html_url,
    abstract_url: row.abstract_url,
    downloaded: row.downloaded || false,
    transaction_id: row.transaction_id,
    upload_status: row.upload_status,
    license: row.license,
    download_format: row.download_format,
    importance_score: row.importance_score,
  }));
}

export async function getStats(): Promise<{
  totalPapers: number;
  categories: Array<{ category: string; count: number }>;
  dateRange: { earliest: Date; latest: Date };
}> {
  if (!conn) {
    throw new Error('DuckDB not initialized');
  }

  // Total papers
  const countResult = await conn.query('SELECT COUNT(*) as count FROM papers');
  const totalPapers = countResult.toArray()[0].count;

  // Top categories
  const categoriesResult = await conn.query(`
    SELECT primary_category as category, COUNT(*) as count
    FROM papers
    GROUP BY primary_category
    ORDER BY count DESC
    LIMIT 10
  `);
  const categories = categoriesResult.toArray().map((row: any) => ({
    category: row.category,
    count: row.count,
  }));

  // Date range
  const dateResult = await conn.query(`
    SELECT
      MIN(published) as earliest,
      MAX(published) as latest
    FROM papers
  `);
  const dateRow = dateResult.toArray()[0];
  const dateRange = {
    earliest: new Date(dateRow.earliest),
    latest: new Date(dateRow.latest),
  };

  return { totalPapers, categories, dateRange };
}

export function closeDuckDB(): void {
  if (conn) {
    conn.close();
    conn = null;
  }
  if (db) {
    db.terminate();
    db = null;
  }
}
