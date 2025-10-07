# Data Scraping to Permaweb Pipeline - Universal Pattern Guide

This document describes the universal architecture pattern used in this project for scraping, storing, and permanently archiving any dataset to Arweave. Use this as a blueprint for other data scraping projects.

## Overview: The Five-Stage Pipeline

```
Stage 1: API Client → Stage 2: Scraper → Stage 3: SQLite → Stage 4: Parquet → Stage 5: Arweave + Viewer
```

### Quick Summary

1. **API Client** - Rate-limited source data fetcher
2. **Scraper** - Orchestrates fetching with filtering, batching, and incremental sync
3. **SQLite Database** - Operational state tracking (what's downloaded, uploaded, errors)
4. **Parquet Export** - Analytics-optimized read-only snapshots for querying and archival
5. **Arweave Upload** - Permanent storage with browser-based viewer using DuckDB WASM

**Critical Architecture Decision**: SQLite is the **single source of truth**. Parquet files are **regenerated exports**, never updated in place.

---

## Stage 1: API Client Pattern

**Purpose**: Respectfully fetch data from external sources while handling errors and rate limits.

### Core Components

```typescript
class DataClient {
  private client: AxiosInstance;
  private limiter: ReturnType<typeof pLimit>;
  private lastRequestTime: number;
  private minRequestInterval: number;

  async enforceRateLimit(): Promise<void>
  async search(params: QueryParams): Promise<Results>
  async searchByCategory(category: string): Promise<Results>
}
```

### Key Patterns

**Rate Limiting** (Two-Layer Approach):
- `p-limit` for concurrent request caps (e.g., 3 concurrent max)
- Manual timestamp-based throttling (e.g., 1 req/sec minimum interval)
- Configurable via environment variables

**Retry Logic**:
- Use `p-retry` with exponential backoff
- Log each retry attempt with attempt number
- Configure max retries (typically 3-5)

**XML/JSON Parsing**:
- Use dedicated parsers (`fast-xml-parser` for XML, native `JSON.parse` for JSON)
- Handle both array and single-item responses consistently
- Extract and normalize data into typed interfaces

**User Agent**:
- Always include descriptive User-Agent with project info
- Example: `ProjectName/1.0.0 (https://github.com/user/repo)`

### Environment Configuration

```bash
API_BASE_URL=https://api.source.com
MAX_CONCURRENT=3              # Concurrent request limit
REQUESTS_PER_SECOND=1         # Rate limit
RETRY_ATTEMPTS=3              # Max retries
RETRY_DELAY=5000              # Initial delay (ms)
USER_AGENT=YourProject/1.0.0  # Identify your bot
```

---

## Stage 2: Scraper Pattern

**Purpose**: Orchestrate data fetching with smart filtering, batching, and incremental updates.

### Core Components

```typescript
class Scraper {
  private client: DataClient;
  private db: Database;
  private downloader: FileDownloader; // Optional for binary data

  async scrapeCategory(category: string, options: Options): Promise<void>
  async incrementalSync(options: Options): Promise<void>
  async scrapeAll(options: Options): Promise<void>
}
```

### Key Patterns

**Batching**:
- Fetch in configurable batches (e.g., 100 items per request)
- Track progress: `start` offset, `totalProcessed`, `totalFailed`
- Use pagination: `start += batchSize` after each batch

**Incremental Sync**:
- Query database for latest update date: `SELECT MAX(updated) FROM items WHERE category = ?`
- Filter API results to only process items newer than latest date
- Early exit when no new items found
- Critical for long-running projects to avoid re-processing

**Progress Tracking**:
- Log progress after each batch: `Processed X/Y items`
- Update database sync status after each category completes
- Handle errors gracefully: log, continue to next batch (don't crash entire job)

**Error Handling Strategy**:
- Catch errors per batch, not per item (allows partial success)
- Store error counts and last error message in database
- Implement retry limits (e.g., skip items with 3+ consecutive errors)
- If entire batch fails and nothing processed yet, rethrow error

**Delay Between Batches**:
- Add fixed delay after each batch (e.g., 1000ms)
- Helps avoid overwhelming API servers
- Separate from rate limiting (this is batch-level, not request-level)

### Smart Filtering Pattern (Optional but Powerful)

For large datasets where you can't store everything:

```typescript
class SmartFilter {
  analyzeImportance(item: Item): ImportanceSignals
  filterImportantItems(items: Item[], minScore: number): Item[]
  getItemsByType(items: Item[], type: string): Item[]
}
```

**Scoring System**:
- Define importance signals (e.g., citations, venue prestige, recency)
- Assign point values to each signal (weighted scoring)
- Calculate total score: `score = signal1 * weight1 + signal2 * weight2 + ...`
- Filter by minimum threshold (e.g., score >= 10)

**Common Signals**:
- Source quality (prestigious journals, conferences)
- Engagement metrics (citations, stars, downloads)
- Recency boost (newer items get small bonus)
- Content indicators (keywords, patterns)
- Collaboration size (author count, contributor count)
- Update frequency (version count, commit frequency)

---

## Stage 3: Database Pattern (SQLite)

**Purpose**: Single source of truth for all operational state and metadata.

### Schema Design Principles

**Core Fields** (Every Item):
```sql
id TEXT PRIMARY KEY,           -- Unique identifier
version INTEGER,               -- Version number
updated TEXT,                  -- Last update timestamp
published TEXT,                -- Original publish date
-- ... item-specific metadata ...
created_at TEXT DEFAULT CURRENT_TIMESTAMP,
updated_at TEXT DEFAULT CURRENT_TIMESTAMP
```

**Download Tracking**:
```sql
downloaded BOOLEAN DEFAULT 0,
download_path TEXT,
download_date TEXT,
error_count INTEGER DEFAULT 0,
last_error TEXT,
last_checked TEXT
```

**Upload Tracking** (for Arweave):
```sql
transaction_id TEXT,           -- Arweave transaction ID
upload_status TEXT DEFAULT 'pending',  -- pending/uploading/completed/failed
upload_date TEXT,
upload_attempts INTEGER DEFAULT 0,
upload_error TEXT
```

**Indexes** (Critical for Performance):
```sql
CREATE INDEX idx_items_updated ON items(updated);
CREATE INDEX idx_items_downloaded ON items(downloaded);
CREATE INDEX idx_items_upload_status ON items(upload_status);
CREATE INDEX idx_items_categories ON items(categories);  -- For JSON fields
CREATE INDEX idx_items_transaction_id ON items(transaction_id);
```

### Key Operations

**Upsert Pattern** (Insert or Update):
```typescript
async upsertItem(item: Item): Promise<void> {
  const stmt = `
    INSERT OR REPLACE INTO items (
      id, version, updated, title, ...
    ) VALUES (?, ?, ?, ?, ...)
  `;
  // Use prepared statements for SQL injection prevention
}
```

**State Tracking Queries**:
```typescript
getUndownloadedItems(limit: number)  // WHERE downloaded = 0 AND error_count < 3
getLatestUpdateDate(category?: string)  // SELECT MAX(updated) FROM items
getReadyForUpload(limit: number)  // WHERE downloaded = 1 AND upload_status IN ('pending', 'failed') AND upload_attempts < 3
getUploadStats()  // Aggregate stats for monitoring
```

**Sync Status Table** (Recommended):
```sql
CREATE TABLE sync_status (
  id INTEGER PRIMARY KEY,
  last_sync_date TEXT,
  last_sync_category TEXT,
  total_items INTEGER,
  downloaded_items INTEGER,
  failed_downloads INTEGER,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

**Error Tracking**:
- Increment `error_count` on failure
- Store `last_error` message for debugging
- Skip items with excessive errors (e.g., `error_count >= 3`)
- Never delete failed items (helps identify patterns)

---

## Stage 4: Parquet Export Pattern

**Purpose**: Create analytics-optimized, immutable snapshots for querying and archival.

### Critical Design Principle

**Parquet files are READ-ONLY exports, never updated directly.**

Workflow:
```
SQLite (source of truth) → Export → Parquet (snapshot) → Query/Upload
After changes to SQLite → Re-export → New Parquet (replace old)
```

### Export Implementation

```typescript
class ParquetExporter {
  private db: Database;
  private duckDb: duckdb.Database;

  async exportToParquet(outputDir: string): Promise<string> {
    // 1. Get all data from SQLite
    const items = await this.getAllItems();

    // 2. Create DuckDB table in memory
    await this.createDuckDBTable();

    // 3. Insert data into DuckDB
    await this.insertItems(items);

    // 4. Export with optimizations
    await conn.exec(`
      COPY (SELECT * FROM items ORDER BY published DESC)
      TO '${outputPath}'
      (
        FORMAT PARQUET,
        COMPRESSION 'ZSTD',        -- Best compression ratio
        ROW_GROUP_SIZE 100000,     -- Optimize for partial reads
        STATS_ENABLED TRUE         -- Enable column statistics
      )
    `);
  }
}
```

### Schema Mapping

**SQLite → Parquet Transformations**:
- JSON arrays in SQLite → Parse and flatten to VARCHAR or multiple columns
- Example: `authors TEXT` (JSON) → `authors VARCHAR, author_count INTEGER, primary_author VARCHAR`
- Add derived fields: `year`, `month` extracted from dates
- Add aggregations: `category_count`, `word_count`, `file_size_mb`

**Parquet Schema Example**:
```typescript
new parquet.ParquetSchema({
  id: { type: 'UTF8', compression: 'SNAPPY' },
  version: { type: 'INT32' },
  updated: { type: 'TIMESTAMP_MILLIS' },
  published: { type: 'TIMESTAMP_MILLIS' },
  year: { type: 'INT32' },              // Derived
  month: { type: 'INT32' },             // Derived
  title: { type: 'UTF8', compression: 'SNAPPY' },
  summary: { type: 'UTF8', compression: 'SNAPPY' },
  authors: { type: 'UTF8', compression: 'SNAPPY' },
  author_count: { type: 'INT32' },       // Derived
  primary_category: { type: 'UTF8', compression: 'SNAPPY' },
  all_categories: { type: 'UTF8', compression: 'SNAPPY' },
  downloaded: { type: 'BOOLEAN' },
  transaction_id: { type: 'UTF8', optional: true },
  importance_score: { type: 'FLOAT', optional: true }
})
```

### Optimization Strategies

**For Browser Access** (DuckDB WASM):
- Sort by most common query field (e.g., `published DESC` for recent-first)
- Use ZSTD compression (better than SNAPPY for web delivery)
- Set `ROW_GROUP_SIZE` based on typical query size (e.g., 100K rows = ~5-20MB uncompressed)
- Enable statistics for query planning

**For Large Datasets**:
- Partition by date: `arxiv_2024_01.parquet`, `arxiv_2024_02.parquet`
- Keep files under 500MB each for fast browser loading
- Create metadata manifest: `manifest.json` listing all files

**Metadata File** (Recommended):
```json
{
  "created": "2025-01-01T00:00:00Z",
  "file": "data_export.parquet",
  "items": 10000,
  "sizeBytes": 52428800,
  "sizeMB": "50.00",
  "optimizations": {
    "sorted": "published DESC",
    "rowGroupSize": 100000,
    "compression": "ZSTD"
  }
}
```

---

## Stage 5: Arweave Upload Pattern

**Purpose**: Permanently store data and provide browser-based access.

### Arweave/Permaweb Tooling

**Primary Upload Tool: ArDrive Turbo SDK** (Recommended ✅)

```bash
npm install @ardrive/turbo-sdk
```

**Why Turbo SDK?**
- Simplified upload API (no need to manage chunking)
- Built-in cost estimation
- Handles transaction signing automatically
- Optimized for large file uploads
- Credit system (pay with AR tokens, get credits)
- Production-ready with good documentation

**Alternative: Arweave JS SDK** (Lower-level)
```bash
npm install arweave
```
Use when you need:
- Direct blockchain interaction
- GraphQL queries for existing data
- Transaction verification
- Custom transaction building

**Wallet Requirements**:
- **Format**: JWK (JSON Web Key) format
- **Generation**: Use Arweave.app web wallet or ArConnect
- **Export**: Download as JSON file
- **Funding**: Send AR tokens to wallet address
- **Security**: Never commit wallet file to git (add to .gitignore)

**Environment Setup**:
```bash
# .env
ARWEAVE_WALLET_PATH=./wallet.json  # Path to JWK file
ARWEAVE_GATEWAY=https://arweave.net  # Optional: custom gateway
```

### Upload Architecture

```typescript
class TurboUploader {
  private turbo: TurboAuthenticatedClient;

  async initialize(): Promise<void>
  async uploadFile(path: string, tags: Tag[]): Promise<UploadResult>
  async uploadBatch(files: File[], onProgress: Callback): Promise<Map<string, Result>>
  async checkBalance(): Promise<Balance>
  async getUploadCost(sizeBytes: number): Promise<Cost>
}
```

**Turbo SDK Initialization**:
```typescript
import { TurboFactory } from '@ardrive/turbo-sdk';
import fs from 'fs/promises';

class TurboUploader {
  private turbo: TurboAuthenticatedClient | null = null;

  async initialize(): Promise<void> {
    // Load JWK wallet
    const jwk = JSON.parse(
      await fs.readFile(this.walletPath, 'utf-8')
    );

    // Initialize authenticated client
    this.turbo = TurboFactory.authenticated({
      privateKey: jwk,
    });

    // Check balance
    const balance = await this.turbo.getBalance();
    console.log(`Balance: ${balance.winc} winc (${balance.ar} AR)`);
  }

  async uploadFile(filePath: string, tags: Array<{name: string; value: string}>): Promise<UploadResult> {
    const fileContent = await fs.readFile(filePath);

    const result = await this.turbo.uploadFile({
      fileStreamFactory: () => fileContent,
      fileSizeFactory: () => fileContent.length,
      dataItemOpts: {
        tags: tags
      }
    });

    // Returns: { id, dataCaches, fastFinalityIndexes, owner }
    return result;
  }

  async getUploadCost(sizeBytes: number): Promise<Cost> {
    const cost = await this.turbo.getUploadCosts({
      bytes: [sizeBytes]
    });
    return cost[0]; // { winc, ar }
  }
}
```

### Batch Upload Pattern

```typescript
class BatchProcessor {
  async processBatch(options: BatchUploadOptions): Promise<void> {
    // 1. Get items ready for upload from database
    const items = await this.db.getReadyForUpload(batchSize);

    // 2. Check balance and estimate costs
    const balance = await this.uploader.checkBalance();
    const cost = await this.uploader.getUploadCost(totalSize);

    // 3. Validate files exist
    for (const item of items) {
      await fs.access(item.file_path); // Throws if missing
    }

    // 4. Upload batch with progress tracking
    const results = await this.uploader.uploadBatch(items, onProgress);

    // 5. Update database with transaction IDs
    for (const [itemId, result] of results) {
      await this.db.markAsUploaded(itemId, result.id);
    }

    // 6. Re-export Parquet with transaction IDs
    // Note: Don't update Parquet directly, re-export from SQLite

    // 7. Process next batch if more items pending
    if (stats.pending_upload > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      await this.processBatch(options);
    }
  }
}
```

### Tagging Strategy

Use Arweave tags for discoverability:

```typescript
const tags = [
  { name: 'Content-Type', value: 'application/pdf' },
  { name: 'App-Name', value: 'your-project-name' },
  { name: 'App-Version', value: '1.0.0' },
  { name: 'Data-Type', value: 'research-paper' },
  { name: 'Title', value: item.title },
  { name: 'Category', value: item.primaryCategory },
  { name: 'Published', value: item.published },
  { name: 'Item-ID', value: item.id }
];
```

### Deployment Pattern

```typescript
async function deployToArweave() {
  // 1. Upload viewer HTML
  const htmlResult = await turbo.uploadFile(viewerPath, htmlTags);

  // 2. Upload Parquet data files
  const parquetFiles = await findParquetFiles('./index');
  const parquetIds = {};
  for (const file of parquetFiles) {
    const result = await turbo.uploadFile(file, parquetTags);
    parquetIds[file.name] = result.id;
  }

  // 3. Create manifest linking everything
  const manifest = {
    index: htmlResult.id,
    data: parquetIds,
    timestamp: new Date().toISOString()
  };

  // 4. Upload manifest
  const manifestResult = await turbo.uploadFile(manifestPath, manifestTags);

  // 5. Return final URL
  return `https://arweave.net/${manifestResult.id}`;
}
```

### Browser Viewer Pattern

**DuckDB WASM Integration**:
```html
<script type="module">
  import * as duckdb from '@duckdb/duckdb-wasm';

  // 1. Initialize DuckDB in browser
  const bundle = await duckdb.selectBundle(bundles);
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);

  // 2. Register Parquet file from Arweave
  const conn = await db.connect();
  await conn.insertArrowFromIPCStream(
    arrowStream,
    { name: 'data' }
  );

  // Or use HTTP range requests for large files:
  await db.registerFileURL(
    'data.parquet',
    `https://arweave.net/${parquetTxId}`,
    duckdb.DuckDBDataProtocol.HTTP,
    true  // Use range requests
  );

  // 3. Query data
  const result = await conn.query(`
    SELECT * FROM data
    WHERE year = 2024
    ORDER BY published DESC
    LIMIT 100
  `);

  // 4. Display results
  displayResults(result);
</script>
```

**Browser Tooling Setup**:

Install DuckDB WASM for client-side querying:
```bash
npm install @duckdb/duckdb-wasm
```

**Bundling DuckDB WASM** (for standalone HTML):
- Copy WASM files from `node_modules/@duckdb/duckdb-wasm/dist/`
- Include: `duckdb-mvp.wasm`, `duckdb-eh.wasm`, `duckdb-browser.worker.js`
- Upload these alongside your HTML viewer to Arweave
- Reference via relative paths or embed inline

**Key Browser Features**:
- **HTTP Range Requests**: DuckDB WASM can query Parquet without downloading entire file
- **Client-Side Filtering**: All queries run in browser, no backend needed
- **Progressive Loading**: Load row groups on demand
- **Offline Capable**: Cache viewer + data for offline use

**Accessing Uploaded Data**:
```typescript
// Transaction ID from upload
const txId = 'YOUR_TRANSACTION_ID';

// Direct access via gateway
const url = `https://arweave.net/${txId}`;

// Or use custom gateway
const url = `https://ar-io.net/${txId}`;

// GraphQL query to find data
const query = `
  query {
    transactions(
      tags: [
        { name: "App-Name", values: ["your-project"] }
        { name: "Data-Type", values: ["parquet"] }
      ]
    ) {
      edges {
        node {
          id
          tags { name value }
        }
      }
    }
  }
`;
```

**Verification Pattern**:
```typescript
async function verifyUpload(txId: string): Promise<boolean> {
  try {
    // Check if transaction exists
    const response = await fetch(`https://arweave.net/${txId}`, {
      method: 'HEAD'
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

**Cost Management**:
- **Estimate before upload**: Use `getUploadCost()` for all files
- **Typical costs** (as of 2024):
  - 1 MB ≈ 0.0001 AR (~$0.01)
  - 100 MB ≈ 0.01 AR (~$1.00)
  - 1 GB ≈ 0.1 AR (~$10.00)
- **One-time payment**: Upload once, stored forever
- **No recurring fees**: Unlike cloud storage (S3, etc.)

**Recommended Package Versions**:
```json
{
  "dependencies": {
    "@ardrive/turbo-sdk": "^1.31.1",
    "@duckdb/duckdb-wasm": "^1.28.0",
    "duckdb": "^0.10.0",  // For Node.js export
    "parquetjs": "^0.11.2"  // For Parquet creation
  }
}
```

---

## Error Handling & Resilience Patterns

### 1. Graceful Degradation

```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', { error });
  // Continue with next operation, don't crash entire job
  continue;
}
```

### 2. Retry with Exponential Backoff

```typescript
await pRetry(
  async () => await operation(),
  {
    retries: 3,
    minTimeout: 1000,
    factor: 2,  // 1s, 2s, 4s
    onFailedAttempt: error => {
      logger.warn(`Attempt ${error.attemptNumber} failed`);
    }
  }
);
```

### 3. State Persistence

- Update database after **every** successful operation
- Use transactions for multi-step operations
- Never lose progress due to crashes

### 4. Idempotency

- Use `INSERT OR REPLACE` (upsert) instead of just `INSERT`
- Check if file exists before downloading
- Check if item already uploaded before re-uploading

### 5. Monitoring & Health Checks

```typescript
class HealthCheck {
  async check(): Promise<HealthStatus> {
    return {
      database: await checkDatabase(),
      filesystem: await checkFilesystem(),
      arweave: await checkArweave(),
      diskSpace: await checkDiskSpace(),
      summary: await getStats()
    };
  }
}
```

---

## CLI Design Pattern

### Commander.js Structure

```typescript
const program = new Command();

program
  .name('your-scraper')
  .description('Description of your scraper')
  .version('1.0.0');

// Main scrape command
program
  .command('scrape')
  .description('Scrape data from source')
  .option('-c, --categories <categories...>', 'Categories to scrape')
  .option('-m, --max-items <number>', 'Maximum items', parseInt)
  .option('--incremental', 'Only fetch new items')
  .action(async (options) => {
    const scraper = new Scraper();
    try {
      await scraper.initialize();
      await scraper.scrape(options);
      await scraper.close();
    } catch (error) {
      logger.error('Scraping failed', { error });
      process.exit(1);
    }
  });

// Database export
program
  .command('export')
  .description('Export SQLite to Parquet')
  .action(async () => {
    const exporter = new ParquetExporter();
    try {
      await exporter.exportToParquet('./index');
    } catch (error) {
      logger.error('Export failed', { error });
      process.exit(1);
    }
  });

// Upload to Arweave
program
  .command('upload')
  .description('Upload to Arweave')
  .option('-b, --batch-size <number>', 'Batch size', parseInt, 10)
  .option('--dry-run', 'Estimate costs without uploading')
  .action(async (options) => {
    const processor = new BatchProcessor();
    try {
      await processor.initialize();
      await processor.processBatch(options);
      await processor.close();
    } catch (error) {
      logger.error('Upload failed', { error });
      process.exit(1);
    }
  });

program.parse();
```

---

## Common Pitfalls & Solutions

### ❌ Pitfall 1: Updating Parquet Files Directly
**Problem**: Trying to update Parquet files in place when data changes.
**Solution**: Always re-export from SQLite. Parquet is read-only snapshot.

### ❌ Pitfall 2: No Incremental Sync
**Problem**: Re-processing entire dataset every run (wastes time and API quota).
**Solution**: Store latest update date, filter API results to only new items.

### ❌ Pitfall 3: Insufficient Rate Limiting
**Problem**: Getting blocked by API for too many requests.
**Solution**: Use two-layer rate limiting (concurrent + per-second) and respect API guidelines.

### ❌ Pitfall 4: Not Tracking Errors
**Problem**: Failed items disappear, no way to debug or retry.
**Solution**: Store error count and last error message in database, skip after N attempts.

### ❌ Pitfall 5: Losing Progress on Crash
**Problem**: Script crashes, all progress lost.
**Solution**: Update database after each batch, not at the end.

### ❌ Pitfall 6: SQL Injection
**Problem**: Building SQL queries with string concatenation.
**Solution**: Always use prepared statements with parameter binding.

### ❌ Pitfall 7: Missing Indexes
**Problem**: Slow queries as dataset grows.
**Solution**: Create indexes on frequently queried columns (dates, status fields, IDs).

### ❌ Pitfall 8: No Dry Run for Uploads
**Problem**: Accidentally spending money on test uploads.
**Solution**: Implement `--dry-run` flag that estimates costs without uploading.

### ❌ Pitfall 9: Not Validating Downloaded Files
**Problem**: Downloading HTML error pages thinking they're PDFs.
**Solution**: Validate file headers (magic bytes) before saving.

### ❌ Pitfall 10: Hardcoded Paths
**Problem**: Script breaks on different machines or operating systems.
**Solution**: Use environment variables and path.join() for cross-platform compatibility.

---

## Performance Optimization Checklist

- [ ] **Database**: Create indexes on all queried columns
- [ ] **API**: Use concurrent requests (with limits)
- [ ] **API**: Implement request batching where possible
- [ ] **Downloads**: Use streaming for large files (don't load into memory)
- [ ] **Parquet**: Sort by most common query pattern
- [ ] **Parquet**: Use appropriate compression (ZSTD for web, SNAPPY for speed)
- [ ] **Parquet**: Set row group size based on typical query size
- [ ] **Memory**: Process data in batches, not all at once
- [ ] **Disk**: Clean up temporary files after processing
- [ ] **Monitoring**: Log performance metrics (time per batch, items per second)

---

## Testing Strategy

### Unit Tests (Optional but Recommended)

```typescript
describe('SmartFilter', () => {
  it('should score conference papers higher', () => {
    const paper = createTestPaper({ journalRef: 'NeurIPS 2024' });
    const signals = filter.analyzeImportance(paper);
    expect(signals.importanceScore).toBeGreaterThan(10);
  });
});
```

### Manual Testing Commands

```bash
# Test scraping (small batch)
node dist/cli.js scrape -c test-category -m 10 --no-download

# Test importance filtering
node dist/cli.js scrape-important --analyze

# Test database export
node dist/cli.js export

# Test upload (dry run)
node dist/cli.js upload -b 5 --dry-run

# Health check
node dist/cli.js health
```

---

## Deployment Workflow

1. **Development**: Test locally with small datasets
2. **Initial Scrape**: Run full scrape to populate database
3. **Export**: Generate initial Parquet files
4. **Upload PDFs**: Upload binary files to Arweave in batches
5. **Re-export**: Update Parquet with transaction IDs
6. **Deploy Viewer**: Upload HTML + Parquet to Arweave
7. **Incremental Updates**: Run incremental scrape periodically (cron job)
8. **Re-deploy**: Export and re-upload Parquet after updates

---

## Example Project Structures

### Minimal (Academic Papers)
```
src/
  api/client.ts         - API wrapper
  scraper/index.ts      - Main scraper
  database/index.ts     - SQLite operations
  downloader/index.ts   - PDF downloader
  cli.ts                - Commands
```

### With Filtering (Large Dataset)
```
src/
  api/client.ts
  scraper/index.ts
  importance/           - NEW: Filtering logic
    filter.ts
    calculator.ts
  database/index.ts
  downloader/index.ts
  cli.ts
```

### Full Featured (Production)
```
src/
  api/client.ts
  scraper/index.ts
  importance/
    filter.ts
    calculator.ts
  database/index.ts
  downloader/index.ts
  index/                - NEW: Parquet export
    exporter.ts
    query.ts
  arweave/              - NEW: Upload logic
    uploader.ts
    processor.ts
  utils/                - NEW: Monitoring
    logger.ts
    healthCheck.ts
    startup.ts
  cli.ts
web/                    - NEW: Browser viewer
  viewer.html
  deploy.js
```

---

## Adapting This Pattern

### For Different Data Sources

**GitHub Repositories**:
- API Client: Use `@octokit/rest`
- Data: Clone repos instead of downloading PDFs
- Importance: Stars, forks, recent activity
- Files: Upload git bundles to Arweave

**Twitter/X**:
- API Client: Use Twitter API v2
- Data: Tweet text, metadata, media
- Importance: Likes, retweets, verified users
- Files: Store media separately, link in Parquet

**Blockchain Data**:
- API Client: Use web3 library or RPC
- Data: Transactions, blocks, events
- Importance: Transaction value, smart contract activity
- Files: Store raw transaction data

**Web Scraping**:
- API Client: Use `axios` + `cheerio` for HTML parsing
- Data: Extracted content from web pages
- Importance: PageRank, backlinks, update frequency
- Files: Store HTML snapshots or processed text

### Configuration Checklist for New Project

1. Define data schema (what fields do you need?)
2. Choose rate limits (check API documentation)
3. Implement importance scoring (if filtering needed)
4. Design Parquet schema (optimize for queries)
5. Define Arweave tags (for discoverability)
6. Create browser viewer UI (if needed)
7. Set up monitoring/logging
8. Write README with commands

---

## Tooling Quick Reference

### Core Dependencies

**Data Scraping**:
```bash
npm install axios fast-xml-parser p-limit p-retry winston
```

**Database**:
```bash
npm install sqlite3          # Or better-sqlite3 (recommended)
npm install duckdb           # For Parquet export
npm install parquetjs        # For Parquet creation
```

**Arweave/Permaweb**:
```bash
npm install @ardrive/turbo-sdk              # Primary upload tool ✅
npm install arweave                         # Optional: low-level API
npm install @duckdb/duckdb-wasm            # Browser querying
```

**CLI & Config**:
```bash
npm install commander dotenv
```

**TypeScript**:
```bash
npm install -D typescript @types/node tsx
```

### Tool Selection Guide

| Need | Tool | Why |
|------|------|-----|
| Upload to Arweave | `@ardrive/turbo-sdk` | Simplified API, cost estimation, production-ready |
| Query on blockchain | `arweave` + GraphQL | Find existing transactions, verify uploads |
| Browser data access | `@duckdb/duckdb-wasm` | Client-side SQL queries on Parquet files |
| Node.js Parquet export | `duckdb` | Fast, efficient Parquet generation |
| Operational database | `better-sqlite3` | Simpler than `sqlite3`, synchronous API |
| Rate limiting | `p-limit` + `p-retry` | Concurrent limits + retry with backoff |
| XML parsing | `fast-xml-parser` | Fast, handles edge cases well |
| CLI commands | `commander` | Standard, well-documented |

### Arweave Gateway Options

| Gateway | URL | Use Case |
|---------|-----|----------|
| Official | `https://arweave.net` | Default, most reliable |
| AR.IO | `https://ar-io.net` | Alternative gateway network |
| Cloudflare | `https://arweave.dev` | Fast CDN access |
| Custom | Your own node | Maximum control |

### Getting Started Checklist

- [ ] Install Arweave wallet (arweave.app or ArConnect)
- [ ] Fund wallet with AR tokens (buy from exchange)
- [ ] Export wallet as JWK JSON file
- [ ] Add wallet path to `.env` file
- [ ] Add `wallet.json` to `.gitignore`
- [ ] Test cost estimation with `--dry-run`
- [ ] Start with small uploads to verify
- [ ] Monitor transaction IDs in database
- [ ] Set up browser viewer with DuckDB WASM
- [ ] Test accessing uploaded data via gateway

### Useful Resources

- **Arweave Docs**: https://docs.arweave.org
- **Turbo SDK Docs**: https://docs.ardrive.io/docs/turbo
- **DuckDB WASM**: https://duckdb.org/docs/api/wasm
- **Parquet Format**: https://parquet.apache.org/docs/
- **ViewBlock**: https://viewblock.io/arweave (transaction explorer)
- **Arweave GraphQL**: https://arweave.net/graphql (query transactions)

---

## Summary: The Golden Rules

1. **SQLite is source of truth**, Parquet is read-only export
2. **Always implement incremental sync** to avoid re-processing
3. **Rate limit respectfully** with two-layer approach
4. **Track errors**, don't lose failed items
5. **Update database after each batch**, not at the end
6. **Validate downloaded files** before saving
7. **Use indexes** on frequently queried columns
8. **Implement dry-run mode** for uploads
9. **Re-export Parquet** after any data changes
10. **Monitor health** with automated checks
11. **Use Turbo SDK** for Arweave uploads (not raw SDK)
12. **Test with small files first**, verify on ViewBlock

This pattern scales from small personal projects (hundreds of items) to large archives (millions of items). The key is choosing the right optimizations for your dataset size.
