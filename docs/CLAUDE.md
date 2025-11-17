# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure (Monorepo)

This is a monorepo with two main packages:
- **`packages/cli/`** - Backend CLI for scraping, uploading, and ArNS management
- **`packages/web/`** - Frontend React web application for viewing papers

## Build and Development Commands

### CLI (Node.js TypeScript)

```bash
# Build CLI from root
npm run build:cli

# Or build from CLI package
cd packages/cli
npm run build

# Run CLI commands (from root)
node packages/cli/dist/cli.js <command>

# Or use npm script shortcut
npm run cli -- <command>
```

### Web App (React + Vite)

```bash
# Build web app from root
npm run build:web

# Or from web package
cd packages/web
npm install
npm run build

# Development server
cd packages/web
npm run dev

# Output: packages/web/dist/
```

### Build All Packages

```bash
# Install all dependencies
npm install

# Build all packages
npm run build
```

## Common Commands

### Scraping and Data Collection

```bash
# Scrape with importance filtering (RECOMMENDED - searches ALL 155+ categories by default)
# Defaults: ALL categories, 1 year, min score 10, downloads HTML (falls back to PDF)
node packages/cli/dist/cli.js scrape-important -n 5000 -d 730        # 5000 papers from last 2 years
node packages/cli/dist/cli.js scrape-important -n 50000 -d 9125 -s 5 # 50k papers, 25 years, lower score
node packages/cli/dist/cli.js scrape-important -t conference -n 1000 # Only conference papers
node packages/cli/dist/cli.js scrape-important -t with-code -n 2000  # Only papers with code

# Traditional category scraping (no importance filtering)
node packages/cli/dist/cli.js scrape -c cs.AI cs.LG -m 100

# Search and download
node packages/cli/dist/cli.js search "transformer" -l 20 -d

# Download only (for papers already in database)
node packages/cli/dist/cli.js download -l 1000

# Incremental sync (only new papers)
node packages/cli/dist/cli.js sync
```

### Database Operations

```bash
# Export SQLite to Parquet format (local only)
node packages/cli/dist/cli.js index:export

# Export to Parquet, upload to Arweave, and update ArNS 'data' undername (ONE COMMAND)
node packages/cli/dist/cli.js index:export-upload

# Query Parquet with DuckDB
node packages/cli/dist/cli.js index:query -s "neural network"

# View statistics
node packages/cli/dist/cli.js stats
```

### Arweave Upload

```bash
# Upload papers in batches
node packages/cli/dist/cli.js upload:batch -b 10
node packages/cli/dist/cli.js upload:all

# Check upload status and verify
node packages/cli/dist/cli.js upload:status
node packages/cli/dist/cli.js upload:verify

# Estimate costs
node packages/cli/dist/cli.js upload:cost -s 2
```

### Web Viewer

```bash
# Build React app (required before deployment)
cd packages/web
npm install
npm run build
cd ../..

# Deploy web viewer to Arweave and update ArNS root '@' record (ONE COMMAND)
# Uploads entire dist/ folder with manifest using Turbo SDK uploadFolder method
node packages/cli/dist/cli.js web:deploy packages/web/dist

# Serve locally for development/testing
cd packages/web
npm run dev
```

### ArNS Management

**Automatic ANT Discovery**: All ArNS commands automatically discover ANT Process IDs by making HEAD requests to the ArNS name. No hardcoded ANT Process IDs needed!

#### Complete Deployment Workflows

```bash
# STEP 1: Deploy data index (uploads parquet + updates 'data' undername)
node packages/cli/dist/cli.js index:export-upload

# STEP 2: Build React app
cd packages/web && npm run build && cd ../..

# STEP 3: Deploy web app (uploads entire dist/ folder with manifest + updates root '@' record)
node packages/cli/dist/cli.js web:deploy packages/web/dist
```

#### Manual ArNS Updates (if needed)

```bash
# Update main site ArNS name
node packages/cli/dist/cli.js arns:update-site <transaction-id>

# Update data index ArNS name
node packages/cli/dist/cli.js arns:update-data <transaction-id>

# Check ArNS status and current records
node packages/cli/dist/cli.js arns:status

# Test ArNS configuration
node packages/cli/dist/cli.js arns:test

# Export, upload, and update ArNS in one command
node packages/cli/dist/cli.js index:export-upload
```

## Architecture Overview

### Monorepo Structure

```
arxiv-scraper/
├── packages/
│   ├── cli/                      # Backend CLI package
│   │   ├── src/                 # TypeScript source
│   │   ├── dist/                # Compiled JavaScript (gitignored)
│   │   ├── node_modules/        # CLI dependencies (gitignored)
│   │   ├── package.json         # CLI package config
│   │   └── tsconfig.json        # CLI TypeScript config
│   │
│   └── web/                      # Frontend web app package
│       ├── src/                 # React components
│       ├── dist/                # Built web app (gitignored)
│       ├── node_modules/        # Web dependencies (gitignored)
│       ├── package.json         # Web app config
│       └── vite.config.ts       # Vite build config
│
├── data/                         # Runtime data (gitignored)
│   ├── downloads/               # Downloaded PDFs by category
│   ├── parquet/                 # Exported Parquet files
│   ├── logs/                    # Application logs
│   └── arxiv.db                 # SQLite database
│
├── docs/                         # Documentation
│   ├── ADMIN_GUIDE.md
│   ├── CLAUDE.md
│   └── CODEBASE_ANALYSIS.md
│
├── dev-utils/                    # Development utilities
│   ├── scripts/
│   └── tests/
│
├── .gitignore                    # Git ignore rules
├── package.json                  # Root workspace config
└── README.md                     # Main readme
```

### Dual Database System

The project uses **two separate database systems** for different purposes:

1. **SQLite** (`data/arxiv.db`) - Primary operational database
   - Handles all scraping state and metadata
   - Tracks download status, upload status, errors
   - Stores paper metadata with full CRUD operations
   - Located at: `packages/cli/src/database/index.ts`

2. **Parquet/DuckDB** (`data/parquet/*.parquet`) - Analytics and permanent storage
   - Read-only analytical queries (fast, efficient)
   - Optimized for Arweave uploads
   - Generated by exporting from SQLite
   - Located at: `packages/cli/src/index/parquetExporter.ts`, `packages/cli/src/index/duckdbQuery.ts`

**Critical workflow:** SQLite → Export → Parquet → Upload to Arweave. Never update Parquet files directly; always re-export from SQLite.

### Core Module Responsibilities (CLI Package)

- **`packages/cli/src/api/arxivClient.ts`** - ArXiv API client with rate limiting and retry logic
- **`packages/cli/src/scraper/`** - Paper scraping orchestration
  - `index.ts` - Main scraper with category and date range support
  - `importantPapersScraper.ts` - Importance-based filtering scraper
  - `smartScraper.ts` - Advanced scraping strategies
- **`packages/cli/src/importance/`** - Smart paper filtering system
  - `importanceCalculator.ts` - Scores papers based on citations, conferences, code availability
  - `smartFilter.ts` - Filter papers by importance thresholds
- **`packages/cli/src/downloader/index.ts`** - PDF downloader with resume support and organized storage
- **`packages/cli/src/database/index.ts`** - SQLite operations (papers, downloads, uploads, sync state)
- **`packages/cli/src/index/`** - Parquet export and DuckDB querying
  - `parquetExporter.ts` - Export SQLite to Parquet
  - `duckdbQuery.ts` - Query Parquet files with DuckDB
  - `optimizedExport.ts` - Streaming export for large datasets
- **`packages/cli/src/arweave/`** - Arweave permanent storage integration
  - `turboUploader.ts` - ArDrive Turbo SDK wrapper for uploads (supports uploadFile and uploadFolder with manifests)
  - `batchProcessor.ts` - Batch upload orchestration with retry logic
  - `arnsManager.ts` - ArNS (Arweave Name System) integration for dynamic content
  - `parquetUpdater.ts` - Update Parquet files with transaction IDs (deprecated - use re-export instead)
- **`packages/cli/src/workflows/`** - Automated deployment workflows
  - `fullDeploy.ts` - Complete deployment pipeline (export → upload → ArNS update)
- **`packages/cli/src/cli.ts`** - Commander.js CLI with all user-facing commands
- **`packages/cli/src/config/index.ts`** - Environment configuration and constants

### Frontend Web App (packages/web/)

- **`packages/web/src/`** - React + Vite production web app
  - DuckDB WASM for in-browser Parquet querying
  - TailwindCSS with arXiv design system
  - Service Worker for COOP/COEP headers (required for SharedArrayBuffer)
  - Loads data dynamically from `data_arxiv` ArNS name

### Key Design Patterns

**ALL Categories Support**: System now supports **155+ ArXiv categories** across all disciplines (CS, Math, Physics, Biology, Finance, etc.). `scrape-important` defaults to searching ALL categories with importance filtering.

**HTML-First Downloads**: Downloads HTML format when available (added Dec 2023, better for AI/LLM processing), automatically falls back to PDF when HTML unavailable. Format tracked in `download_format` column.

**License Collection**: Extracts license information from ArXiv's `dc:rights` field. Most papers use default "arXiv-1.0" license; some have Creative Commons licenses (CC BY, CC BY-SA, etc.). License URLs stored for later Arweave upload tagging.

**Importance Scoring**: Papers are scored 0-50+ based on signals (conferences: 20pts, journals: 8pts, surveys: 7pts, code: 5pts, keywords: 3-5pts). Use `ImportanceCalculator` to score papers and filter by threshold.

**Incremental Sync**: Tracks latest update date per category in SQLite. Use `--incremental` flag or `sync` command to fetch only new papers.

**Rate Limiting - Burst Mode**: Uses `export.arxiv.org` with burst mode (4 requests/second with 1 second sleep after each burst). More efficient than constant 1 req/3s. Automatic 404 abort (no retries for non-existent papers).

**Error Handling**: All operations use retry logic with exponential backoff (via `p-retry`). Errors are logged with Winston and tracked in SQLite (`error_count`, `last_error` columns).

**Upload State Machine**: Papers track `upload_status` (pending → uploading → completed/failed). Use `BatchProcessor` to manage uploads with automatic retry.

**ArNS Dynamic Content**: The project uses two ArNS names for dynamic content delivery:
- `arxiv` - Main web viewer application (updated when deploying new versions)
- `data_arxiv` - Parquet data index (updated automatically after export and upload)

Web applications load data from `https://data_arxiv.arweave.net` instead of hardcoded transaction IDs, enabling automatic updates without redeployment.

## Configuration

Environment variables in `.env` (place in root directory):
- `ARWEAVE_WALLET_PATH` - Path to Arweave JWK wallet (required for uploads)
- `DB_PATH` - SQLite database path (default: `./data/arxiv.db`)
- `DOWNLOAD_DIR` - PDF storage directory (default: `./data/downloads`)
- `MAX_CONCURRENT`, `REQUESTS_PER_SECOND` - Rate limiting
- `BATCH_SIZE` - Papers per API request (default: 100)

**ArNS Configuration** (required for dynamic content):
- `ARNS_NAME_MAIN` - Main site name (default: `arxiv`)
- `ARNS_NAME_DATA` - Data index name (default: `data_arxiv`)
- `ANT_PROCESS_ID_MAIN` - ANT process ID for main site (optional - auto-discovered if not set)
- `ANT_PROCESS_ID_DATA` - ANT process ID for data index (optional - auto-discovered if not set)
- `ARNS_TTL_SECONDS` - TTL for ArNS records (default: 60)

## TypeScript Configuration

- **Strict mode disabled** (`strict: false`) but individual checks enabled
- `strictNullChecks: true` - Handle nulls explicitly
- `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` - Code quality checks
- Target: ES2022, Module: CommonJS (CLI), ESModule (Web)
- Source maps and declarations enabled for debugging

## Testing

No formal test suite exists. Run manual tests with:
```bash
# Test scraping
node packages/cli/dist/cli.js scrape -c cs.AI -m 10 --no-download

# Test importance filtering
node packages/cli/dist/cli.js scrape-important --analyze

# Test database export
node packages/cli/dist/cli.js index:export

# Test uploads (dry run)
node packages/cli/dist/cli.js upload:batch -b 5 --dry-run
```

## Working with the Codebase

**When adding new commands**: Add to `packages/cli/src/cli.ts` using Commander.js pattern. Follow existing command structure (initialize scraper/db, try/catch with logger, close on completion).

**When modifying paper schema**: Update ALL THREE locations:
1. `ArxivPaper` type in `packages/cli/src/types/index.ts`
2. Database schema in `packages/cli/src/database/index.ts` (add migration in `initialize()`)
3. Parquet schema in `packages/cli/src/index/parquetExporter.ts` and `packages/cli/src/index/types.ts`

Recent schema additions: `license` (string), `html_url` (string), `download_format` ('html' | 'pdf').

**When adding importance signals**: Extend `ImportanceCalculator` with new scoring methods. Update `calculateImportance()` to include new signals with appropriate weights.

**When debugging uploads**: Check SQLite `upload_status`, `upload_attempts`, `upload_error` columns. Use `upload:status` command to see failed uploads. Re-run `upload:batch` to retry failures.

**After upload changes**: Always re-export Parquet files with `index:export` to include updated transaction IDs. Do not manually edit Parquet files.

**When updating data**: Use `index:export-upload` to export, upload to Arweave, and update ArNS automatically. The workflow is: SQLite → Parquet → Arweave → ArNS update → Web app loads latest data.

**When deploying web app**: Use `web:deploy packages/web/dist` to upload entire dist/ folder with Arweave manifest. The uploadFolder method creates a manifest that maps paths to transaction IDs, enabling proper routing for React apps with client-side routing.

**ArNS Configuration**: ANT Process IDs are automatically discovered from ArNS names if not set in `.env`. Use `arns:test` to verify configuration. ANT Process IDs identify the Arweave Name Tokens that control your ArNS names.

**Data Folder**: All runtime data is stored in `data/` folder which is gitignored. This includes:
- `data/downloads/` - Downloaded PDFs organized by category
- `data/parquet/` - Exported Parquet files for analytics
- `data/arxiv.db` - SQLite database (source of truth)
- `data/logs/` - Application logs (combined.log, error.log)
