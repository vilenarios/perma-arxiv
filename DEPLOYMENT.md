# 🚀 ArXiv Archive Deployment Guide

## Complete Permanent Archive Solution

This guide explains how to create and deploy a permanent, self-contained ArXiv archive on Arweave.

## Architecture Overview

```
┌─────────────────────────────────────────┐
│          Your Permanent Archive         │
├─────────────────────────────────────────┤
│  1. Bundled HTML Viewer (No CDN deps)   │
│  2. DuckDB-WASM files (Local bundle)    │
│  3. Parquet Index (HTTP range requests) │
│  4. PDF Papers (With transaction IDs)   │
└─────────────────────────────────────────┘
                    ↓
              All on Arweave
              (Works Forever)
```

## Key Features

✅ **No External Dependencies** - DuckDB-WASM is bundled, not from CDN
✅ **HTTP Range Requests** - Only downloads needed data from Parquet
✅ **Scales to Millions** - Single Parquet file can hold millions of papers
✅ **Permanent** - Once on Arweave, works forever

## Step-by-Step Deployment

### 1. Prepare Your Data

```bash
# Scrape papers (adjust number as needed)
node dist/cli.js scrape-important -n 10000

# Check what you have
node dist/cli.js stats
```

### 2. Bundle the Viewer

```bash
# This downloads DuckDB-WASM and creates a bundled viewer
npm run web:bundle

# Creates:
# - web/arxiv-bundled.html (The viewer)
# - web/duckdb-bundle/ (DuckDB WASM files)
# Total size: ~22MB
```

### 3. Create Optimized Parquet

```bash
# Export from SQLite database to Parquet format
npm run index:export

# This creates an optimized Parquet file from arxiv.db:
# - Read-only export (not modified directly)
# - Sorted by date (newest first)
# - Statistics enabled for fast queries
# - Compressed with ZSTD
# - Includes transaction IDs from uploaded papers
```

### 4. Deploy Everything

```bash
# Complete deployment to Arweave
npm run deploy:complete

# This will:
# 1. Upload any pending papers to Arweave
# 2. Save transaction IDs to SQLite database
# 3. Re-export fresh Parquet from updated database
# 4. Upload the Parquet index to Arweave
# 5. Upload the bundled viewer + DuckDB files
# 6. Give you a single permanent URL
```

## How It Works

### Database Architecture

- **arxiv.db (SQLite)**: Source of truth for all paper metadata and transaction IDs
- **Parquet files**: Read-only exports from SQLite for analytics and viewing
- **Important**: Never delete arxiv.db after scraping - it contains all metadata!

### Data Flow

1. **User visits**: `https://arweave.net/{viewer-tx-id}`
2. **Viewer loads**: HTML + bundled DuckDB-WASM (22MB, cached after first visit)
3. **Connect to data**: Points to `https://arweave.net/{parquet-tx-id}`
4. **Queries use range requests**:
   - Browse latest: Downloads ~1-2MB
   - Search: Downloads ~5-10MB
   - Full scan: Downloads entire file (rare)

### Example Query Performance

For a 500MB Parquet with 1 million papers:

| Query | Data Downloaded | Time |
|-------|-----------------|------|
| Browse 20 latest | 1-2 MB | <1s |
| Search "neural network" | 5-10 MB | 2-3s |
| Filter by category | 10-20 MB | 3-5s |
| Get all papers | 500 MB | 60s |

## Configuration Options

### Custom Wallet Path

Edit `web/smart-deploy.js`:
```javascript
const WALLET_PATH = 'path/to/your/wallet.json';
```

### Parquet Optimization

Edit `src/index/optimizedExport.ts`:
```javascript
ROW_GROUP_SIZE: 100000,  // Smaller = better for range requests
COMPRESSION: 'ZSTD',      // Best compression ratio
```

## Testing Locally

```bash
# 1. Start local server
npm run web:serve

# 2. Open browser to http://localhost:8080/arxiv-bundled.html

# 3. Enter your Parquet file path or Arweave TX ID
```

## Cost Estimation

### Storage Costs (one-time)

- **Viewer + DuckDB**: ~22MB → ~$0.10
- **Parquet Index** (1M papers): ~500MB → ~$2.00
- **PDFs** (1000 papers): ~2GB → ~$8.00
- **Total**: ~$10 for permanent storage

### Usage Costs

- **Zero!** Once deployed, no ongoing costs
- Users download directly from Arweave
- HTTP range requests minimize bandwidth

## Troubleshooting

### "0 Parquet files created"

- This means no papers in the database
- Check `node dist/cli.js stats` to see paper count
- Make sure you didn't delete arxiv.db after scraping
- Re-run scraper if needed: `node dist/cli.js scrape-important -n 100`

### "Papers uploaded: 0" despite having PDFs

- Database doesn't have records for the PDFs
- This happens if you delete arxiv.db after downloading
- Solution: Re-run scraper, it will re-create database entries

### "DuckDB parameter binding error"

- Fixed in latest version
- Run `npm run build` to rebuild TypeScript
- Parquet files are read-only exports, not updated directly

### "DuckDB failed to initialize"

- Check browser console for CORS errors
- Ensure duckdb-bundle/ folder was uploaded with HTML
- Try a different Arweave gateway

### "Parquet file not loading"

- Verify the transaction ID is correct
- Check if Arweave gateway supports range requests
- Try alternate gateways: arweave.dev, g8way.io

### "Queries are slow"

- Normal for first query (building indexes)
- Subsequent queries should be faster
- Consider creating smaller category-specific archives

## Advanced: Multiple Archives

For very large datasets, consider multiple focused archives:

```bash
# Create category-specific archives
node dist/cli.js scrape -c cs.AI -m 10000
npm run index:export
npm run deploy:complete
# Result: AI-focused archive

node dist/cli.js scrape -c physics.hep-th -m 10000
npm run index:export
npm run deploy:complete
# Result: Physics-focused archive
```

## Security & Privacy

- **Wallet Security**: Never commit wallet.json to git
- **Transaction IDs**: Are public and permanent
- **Content**: Cannot be modified once on Arweave
- **Access**: Anyone with the URL can access

## Summary

Your deployment creates a:
- 🔒 **Permanent** archive (cannot be taken down)
- 🚀 **Fast** viewer (HTTP range requests)
- 📦 **Self-contained** system (no external deps)
- 💰 **Cost-effective** solution (~$10 for 1000 papers)
- 🌍 **Globally accessible** resource

Once deployed, your archive URL will work forever with no maintenance!