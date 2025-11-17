# ArXiv Scraper - Administrator Guide

## Common Workflow

### Complete Process from Scraping to Deployment

```bash
# 1. Scrape important papers (starts fresh or adds to existing)
node dist/cli.js scrape-important -n 1000

# 2. Check what you have
node dist/cli.js stats

# 3. Deploy data index (export + upload + update ArNS 'data' undername)
node dist/cli.js index:export-upload

# 4. Build React app
cd arxiv-app && npm run build && cd ..

# 5. Deploy web app (upload dist/ folder + update ArNS root '@' record)
node dist/cli.js web:deploy arxiv-app/dist
```

**Important Notes:**
- arxiv.db is your source of truth - never delete it!
- Each deployment step is independent - update data without touching app, or vice versa
- ArNS updates happen automatically, with automatic ANT Process ID discovery
- The web app dynamically loads data from the correct gateway based on hostname

## Table of Contents
- [Installation & Setup](#installation--setup)
- [Database Architecture](#database-architecture)
- [Core Commands](#core-commands)
- [Smart Importance Scraping](#smart-importance-scraping)
- [Scraping Commands](#scraping-commands)
- [Search Commands](#search-commands)
- [Index Management](#index-management)
- [Database Operations](#database-operations)
- [Proven Strategies](#proven-strategies)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Installation & Setup

### Initial Setup
```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build
# OR
npx tsc

# Test installation
node dist/cli.js --version

# Note: If you get TypeScript errors about duplicate properties,
# run 'npm run build' again - the issue has been fixed
```

### Directory Structure
```
arxiv-scraper/
├── dist/              # Compiled JavaScript
├── downloads/         # Downloaded PDFs (organized by category)
├── index/             # Parquet index files
├── arxiv.db           # SQLite database (working database)
├── *.log             # Log files
└── src/              # TypeScript source code
```

## Database Architecture

The scraper uses a **dual-database architecture** for different purposes:

### 1. SQLite Database (arxiv.db)
- **Purpose**: Real-time data collection and state tracking
- **When you see**: "Connected to SQLite database"
- **Used for**:
  - Storing papers during scraping
  - Tracking download status
  - Incremental sync (storing last update dates)
  - Managing retry attempts for failed downloads
- **Why**: Fast writes, ACID compliance, good for incremental updates

### 2. DuckDB + Parquet Files (index/*.parquet)
- **Purpose**: Fast analytical queries and permanent storage
- **When used**: After running `index:export` command
- **Used for**:
  - Efficient searching across large datasets
  - Statistical analysis and aggregations
  - Preparing for Arweave upload
  - Future web app queries
- **Why**: 70-90% compression, columnar storage, blazing fast analytics

### Workflow: SQLite → Parquet → Arweave
```bash
# 1. Scrape to SQLite (data collection)
node dist/cli.js scrape -c cs.AI -m 100

# 2. Export to Parquet (data optimization)
node dist/cli.js index:export

# 3. Query with DuckDB (fast analytics)
node dist/cli.js index:query -s "transformer"

# 4. Future: Upload Parquet files to Arweave
```

## Core Commands

All commands are run using: `node dist/cli.js [command] [options]`

### Available Commands
- `scrape` - Scrape papers from ArXiv
- `scrape-quality` - Scrape only high-quality/peer-reviewed papers
- `scrape-important` - Smart filtering for important papers
- `search` - Search for specific papers
- `download` - Download missing PDFs
- `sync` - Incremental sync (new papers only)
- `stats` - View database statistics
- `categories` - List available ArXiv categories
- `index:export` - Export to Parquet format
- `index:query` - Query Parquet index
- `index:stats` - View index statistics
- `index:similar` - Find similar papers

## Smart Importance Scraping

### NEW: Importance Detection System

The scraper can identify important papers using **only ArXiv metadata** (no external APIs needed).

#### Importance Scoring (0-50+ points)

The system analyzes these signals from ArXiv data:

| Signal | Points | Where Found | Example |
|--------|--------|-------------|---------|
| **Top Conference** | 20 | comment/journalRef | "Accepted NeurIPS 2024" |
| **Journal Publication** | 8 | journalRef | "Nature Machine Intelligence" |
| **Conference Paper** | 6 | comment | "to appear at ICML" |
| **Survey/Review** | 7 | title/abstract | "A Comprehensive Survey of..." |
| **Has Code** | 5 | comment/abstract | "github.com/..." |
| **Multiple Versions** | 2-6 | version field | v3, v4, v5 |
| **Important Keywords** | 3-5 | title | "state-of-the-art", "benchmark" |
| **Recent (< 7 days)** | 3 | published date | Last week's papers |
| **Must-Include** | 10 | title/abstract | "GPT-4", "Llama", "Gemini" |

#### Scrape Important Papers Command

```bash
node dist/cli.js scrape-important [options]

Options:
  -c, --categories <categories...>  Categories (default: cs.LG, cs.AI)
  -d, --days <number>              Days back to search (default: 30)
  -s, --min-score <number>         Minimum importance score (default: 10)
  -n, --number <number>            Max papers to collect (default: 50)
  --no-download                    Skip PDF downloads
  -t, --type <type>               Filter type (see below)
  --weekly                         Top papers from this week
  --hidden-gems                    Find papers with code
  --analyze                        Analyze existing database

Filter Types (-t option):
  all         - All papers above score threshold
  conference  - Only conference papers (NeurIPS, ICML, etc.)
  journal     - Only journal publications
  survey      - Only survey/review papers
  with-code   - Only papers with code implementations
```

#### Examples

```bash
# Analyze your existing database for hidden important papers
node dist/cli.js scrape-important --analyze

# Get ONLY conference papers (NeurIPS, ICML, ICLR, etc.)
node dist/cli.js scrape-important -t conference -n 30

# Get ONLY journal publications
node dist/cli.js scrape-important -t journal -n 20

# Get ONLY survey/review papers (extremely valuable!)
node dist/cli.js scrape-important -t survey -n 15

# Get ONLY papers with code implementations
node dist/cli.js scrape-important -t with-code -n 40

# Get top papers from this week
node dist/cli.js scrape-important --weekly

# Find hidden gems (papers with GitHub repos)
node dist/cli.js scrape-important --hidden-gems

# Very selective: Only papers scoring 20+ (top tier)
node dist/cli.js scrape-important -s 20 -n 20

# Moderately selective: Papers scoring 15+
node dist/cli.js scrape-important -s 15 -n 50
```

## Scraping Commands

### Basic Scrape
```bash
node dist/cli.js scrape [options]

Options:
  -c, --categories <categories...>  Categories to scrape (default: all)
  -s, --start-date <date>           Start date (YYYY-MM-DD)
  -e, --end-date <date>             End date (YYYY-MM-DD)
  -m, --max-papers <number>         Maximum papers to scrape
  --no-download                     Skip PDF downloads
  --incremental                     Only fetch new papers since last sync

Examples:
  # Scrape 100 papers from AI categories
  node dist/cli.js scrape -c cs.AI cs.LG -m 100

  # Scrape without downloading PDFs (metadata only)
  node dist/cli.js scrape -c cs.AI -m 500 --no-download

  # Scrape papers from specific date range
  node dist/cli.js scrape -s 2024-01-01 -e 2024-12-31 -m 1000

  # Incremental update (only new papers)
  node dist/cli.js scrape --incremental
```

### Quality-Filtered Scrape
```bash
node dist/cli.js scrape-quality [options]

Options:
  -c, --categories <categories...>  Categories (default: cs.LG, cs.AI)
  -d, --days <number>               Days back to search (default: 30)
  -n, --number <number>             Number of papers (default: 100)
  --no-download                     Skip PDF downloads
  --peer-reviewed                   Only peer-reviewed papers
  --weekly                          Get top papers from last week

Examples:
  # Get peer-reviewed papers from last 30 days
  node dist/cli.js scrape-quality --peer-reviewed -d 30 -n 50

  # Get top 10 papers from last week
  node dist/cli.js scrape-quality --weekly -c cs.LG cs.CV

  # Get high-quality papers (multi-version, conference papers)
  node dist/cli.js scrape-quality -c cs.AI -d 90 -n 100
```

## Search Commands

### Paper Search
```bash
node dist/cli.js search <query> [options]

Options:
  -l, --limit <number>  Maximum results (default: 10)
  -d, --download        Download PDFs of results

Examples:
  # Basic search
  node dist/cli.js search "transformer architecture"

  # Search with more results
  node dist/cli.js search "diffusion model" -l 50

  # Search and download PDFs
  node dist/cli.js search "GPT" -l 20 -d
```

### Proven High-Value Searches

```bash
# Conference papers (these ARE in ArXiv metadata!)
node dist/cli.js search "accepted NeurIPS" -l 50 -d
node dist/cli.js search "ICML 2024" -l 50 -d
node dist/cli.js search "ICLR 2024" -l 50 -d
node dist/cli.js search "CVPR accepted" -l 50 -d

# Papers with code (verifiable in metadata)
node dist/cli.js search "github.com" -l 100 -d
node dist/cli.js search "code available" -l 50 -d

# Survey papers (high value per paper)
node dist/cli.js search "survey" -l 30 -d
node dist/cli.js search "comprehensive review" -l 20 -d

# Benchmark papers
node dist/cli.js search "benchmark" -l 40 -d
node dist/cli.js search "state-of-the-art" -l 40 -d

# Foundation models
node dist/cli.js search "foundation model" -l 30 -d
node dist/cli.js search "large language model" -l 30 -d

# Specific important papers
node dist/cli.js search "GPT-4" -l 20 -d
node dist/cli.js search "Llama 3" -l 20 -d
node dist/cli.js search "Claude" -l 20 -d
```

## Index Management

### Important: Database Architecture

- **arxiv.db (SQLite)**: Primary database, source of truth for all paper metadata
- **Parquet files**: Read-only exports from SQLite for analytics and viewing
- **Never delete arxiv.db** after scraping - it contains all the metadata!

### Export to Parquet
```bash
node dist/cli.js index:export [options]

Options:
  -b, --batch-size <number>  Batch size for export (default: 10000)
  -p, --partitioned          Create partitioned export by category

Examples:
  # Export entire SQLite database to Parquet format
  node dist/cli.js index:export

  # Create partitioned export
  node dist/cli.js index:export --partitioned

  # Custom batch size for large databases
  node dist/cli.js index:export -b 5000

Note: Parquet files are regenerated from SQLite after uploads to include transaction IDs
```

### Query Parquet Index
```bash
node dist/cli.js index:query [options]

Options:
  -c, --category <category>    Filter by category
  -a, --author <author>        Filter by author
  -s, --search <text>          Search in title and summary
  -l, --limit <number>         Maximum results (default: 10)
  --start-date <date>          Start date (YYYY-MM-DD)
  --end-date <date>            End date (YYYY-MM-DD)

Examples:
  # Search in Parquet index
  node dist/cli.js index:query -s "neural network" -l 20

  # Filter by category
  node dist/cli.js index:query -c cs.LG -l 50

  # Filter by author
  node dist/cli.js index:query -a "Yoshua Bengio"

  # Date range query
  node dist/cli.js index:query --start-date 2024-01-01 --end-date 2024-12-31

  # Combined filters
  node dist/cli.js index:query -c cs.AI -s "transformer" --start-date 2024-01-01
```

### Index Statistics
```bash
# View comprehensive index statistics
node dist/cli.js index:stats

# Find papers similar to a given paper
node dist/cli.js index:similar <paper-id> -l 10

Example:
  node dist/cli.js index:similar 2401.12345 -l 15
```

## Database Operations

### Incremental Sync
```bash
# Sync all categories (only new papers)
node dist/cli.js sync

# Sync without downloading PDFs
node dist/cli.js sync --no-download

# Note: Incremental sync checks the last update date for each category
# If no new papers exist, nothing will be downloaded (this is normal!)
```

### Download Missing PDFs
```bash
# Download up to 100 missing PDFs
node dist/cli.js download

# Download specific number
node dist/cli.js download -l 50
```

### View Statistics
```bash
# Database and download statistics
node dist/cli.js stats
```

### List Categories
```bash
# Show all available ArXiv categories
node dist/cli.js categories
```

## Proven Strategies

### Strategy 1: Get Only Top-Tier Papers (~100-200 papers)
```bash
# Step 1: Get conference papers
node dist/cli.js search "accepted NeurIPS" -l 50 -d
node dist/cli.js search "ICML 2024" -l 50 -d

# Step 2: Get survey papers (high value!)
node dist/cli.js scrape-important -t survey -n 30

# Step 3: Get papers with code
node dist/cli.js scrape-important -t with-code -n 50

# Result: ~130 high-quality papers instead of 10,000+
```

### Strategy 2: Weekly Important Papers (~20-30 papers/week)
```bash
# Run weekly to get only the best new papers
node dist/cli.js scrape-important --weekly

# Or get this week's papers with code
node dist/cli.js scrape-important --hidden-gems
```

### Strategy 3: Comprehensive but Filtered (~500 papers)
```bash
# Step 1: Analyze what you have
node dist/cli.js scrape-important --analyze

# Step 2: Get all paper types with moderate threshold
node dist/cli.js scrape-important -s 12 -n 200 -c cs.LG cs.AI

# Step 3: Get conference papers
node dist/cli.js scrape-important -t conference -n 100

# Step 4: Get journal papers
node dist/cli.js scrape-important -t journal -n 100

# Step 5: Get survey papers
node dist/cli.js scrape-important -t survey -n 50

# Step 6: Get papers with code
node dist/cli.js scrape-important -t with-code -n 50
```

### Strategy 4: Minimal High-Impact Set (~50 papers)
```bash
# Only the absolute best papers (score 20+)
node dist/cli.js scrape-important -s 20 -n 30

# Plus recent survey papers
node dist/cli.js search "comprehensive survey" -l 20 -d
```

## Troubleshooting

### Common Issues

#### 1. "No new papers since last sync"
This is **normal behavior** for incremental sync. It means:
- You already have all recent papers
- No papers were published since your last sync

Solution: Use non-incremental scrape or search for specific papers:
```bash
# Force new scrape (non-incremental)
node dist/cli.js scrape -c cs.AI -m 50

# Or search for specific papers
node dist/cli.js search "2024" -l 50
```

#### 2. Rate Limiting
```bash
# If getting rate limited, reduce concurrent requests
# Scrape smaller batches
node dist/cli.js scrape -c cs.AI -m 20

# Add delays between operations
node dist/cli.js scrape -c cs.AI -m 100 --no-download
# Wait a few minutes
node dist/cli.js download -l 50
```

#### 3. Memory Issues
```bash
# For large datasets, use smaller batch sizes
node dist/cli.js index:export -b 1000

# Scrape in smaller chunks
node dist/cli.js scrape -c cs.AI -m 100
```

#### 4. TypeScript Compilation Errors
```bash
# If you see TypeScript errors, recompile:
npm run build
# OR
npx tsc

# Common fixes:
# - Duplicate property error: Fixed in latest version
# - Module errors: Make sure all dependencies are installed
# - Path errors on Windows: Use forward slashes in imports

# Then use the compiled JavaScript:
node dist/cli.js [command]
```

#### 5. DuckDB/Parquet Query Issues
```bash
# Note: The DuckDB Node.js implementation has some limitations.
# If index:query doesn't work, you can:

# Option 1: Use the basic search (works well)
node dist/cli.js search "transformer" -l 20

# Option 2: Query the SQLite database directly
# The Parquet export still works for future Arweave upload

# The Parquet files are correctly created and can be used
# with DuckDB-WASM in the browser for your future web app
```

### Validation Commands

#### Check What ArXiv Actually Provides
```bash
# See what metadata fields are available
node dist/cli.js search "NeurIPS" -l 1

# Look for:
# - comment field: Conference acceptances, GitHub links
# - journalRef field: Journal publications
# - version field: Number of revisions
```

#### Test Importance Detection
```bash
# Analyze your existing database
node dist/cli.js scrape-important --analyze

# This shows you the top-scored papers you already have
```

### Log Files
- `error.log` - Error messages only
- `combined.log` - All log messages
- Console output - Real-time progress

## Best Practices

### Efficient Scraping Workflow

#### For Minimal Dataset (50-100 papers)
```bash
# 1. Get only survey papers (highest value per paper)
node dist/cli.js scrape-important -t survey -n 30

# 2. Get recent conference papers
node dist/cli.js search "accepted NeurIPS 2024" -l 40 -d

# 3. Get papers with code
node dist/cli.js search "github.com" -l 30 -d
```

#### For Research Dataset (500-1000 papers)
```bash
# 1. Scrape metadata first (no PDFs)
node dist/cli.js scrape-important -n 1000 --no-download

# 2. Analyze and filter
node dist/cli.js scrape-important --analyze

# 3. Download only top papers
node dist/cli.js download -l 500
```

#### Daily Maintenance
```bash
# Morning routine (5 min)
node dist/cli.js sync                    # Check for new papers
node dist/cli.js scrape-important --weekly  # Get week's best
node dist/cli.js stats                   # Check statistics
```

### Storage Management

#### Estimate Storage Needs
- Metadata only: ~1KB per paper
- With PDFs: ~1-3MB per paper
- Parquet index: ~20% of SQLite size

#### Storage by Strategy
```
50 important papers: ~100MB
100 important papers: ~200MB
500 important papers: ~1GB
1000 papers: ~2GB
Full scrape (10,000+): ~20GB+
```

### Performance Tips

1. **Scrape metadata first, download PDFs later**
   ```bash
   node dist/cli.js scrape-important -n 200 --no-download
   node dist/cli.js download -l 100
   ```

2. **Use importance thresholds**
   ```bash
   # Very selective (score 20+)
   node dist/cli.js scrape-important -s 20 -n 50

   # Moderate (score 15+)
   node dist/cli.js scrape-important -s 15 -n 100

   # Inclusive (score 10+)
   node dist/cli.js scrape-important -s 10 -n 200
   ```

3. **Query Parquet for analytics**
   ```bash
   # Export once
   node dist/cli.js index:export

   # Query many times (fast!)
   node dist/cli.js index:query -s "transformer"
   ```

## Advanced Usage

### Custom Importance Detection
```bash
# Find papers by specific signals
node dist/cli.js scrape-important -t conference  # Conference papers
node dist/cli.js scrape-important -t journal     # Journal papers
node dist/cli.js scrape-important -t survey      # Surveys/reviews
node dist/cli.js scrape-important -t with-code   # Has GitHub repo
```

### Automated Daily Collection (Cron)
```bash
# Add to crontab for daily collection of important papers
0 9 * * * cd /path/to/arxiv-scraper && node dist/cli.js scrape-important --weekly >> weekly.log 2>&1
```

### Export for Analysis
```bash
# Export high-score papers to JSON
node dist/cli.js index:query -l 10000 > all_papers.json

# Filter in external tools
cat all_papers.json | jq '.[] | select(.downloaded == true)'
```

## Arweave Upload System

The scraper includes complete Arweave upload functionality using the ArDrive Turbo SDK.

### Setup

1. **Get an Arweave Wallet**:
   - Create a wallet at https://arweave.app or use ArConnect
   - Export as JWK (JSON) format
   - Save as `wallet.json` in project root

2. **Fund Your Wallet**:
   - Purchase AR tokens or use Turbo credits
   - Check balance: `node dist/cli.js upload:cost`

### Upload Commands

#### Check Costs and Balance
```bash
# Check wallet balance
node dist/cli.js upload:status

# Estimate upload cost for a file size
node dist/cli.js upload:cost -s 2  # Cost for 2MB
```

#### Upload Papers
```bash
# Upload a batch of papers
node dist/cli.js upload:batch -b 10           # Upload 10 papers
node dist/cli.js upload:batch -b 10 --dry-run # Test without uploading

# Upload all downloaded papers
node dist/cli.js upload:all -b 20 -d 5000     # Batch size 20, 5s delay

# Verify uploads on Arweave
node dist/cli.js upload:verify
```

### Upload Flow

1. **Papers are uploaded with metadata tags**:
   - ArXiv ID
   - Title, Authors, Categories
   - Publication date
   - Abstract (truncated)

2. **Transaction IDs are stored in**:
   - SQLite database (for tracking)
   - Parquet files (for querying)

3. **Automatic features**:
   - Retry failed uploads (up to 3 attempts)
   - Resume interrupted batch uploads
   - Progress tracking and reporting

### Upload Options

```bash
Options for upload:batch and upload:all:
  -b, --batch-size <n>    Papers per batch (default: 10)
  -d, --delay <ms>        Delay between batches (default: 5000)
  --dry-run               Simulate without uploading
  -w, --wallet <path>     Wallet file path (default: ./wallet.json)
```

### Tracking Uploads

The system tracks upload status in the database:
- `pending` - Ready for upload
- `completed` - Successfully uploaded with transaction ID
- `failed` - Upload failed after retries

View upload statistics:
```bash
node dist/cli.js upload:status
```

### Parquet Updates

After uploading, Parquet files are automatically updated with:
- `transaction_id` - Arweave transaction ID
- `upload_date` - When uploaded

This enables querying uploaded papers:
```bash
# Query papers that have been uploaded
node dist/cli.js index:query
```

## Quick Setup Guide

```bash
# 1. First time setup
npm install
npm run build

# 2. Get your first important papers (no mass download!)
node dist/cli.js scrape-important -t survey -n 10        # Start with surveys
node dist/cli.js search "NeurIPS accepted" -l 20 -d      # Get conference papers

# 3. Check what you have
node dist/cli.js stats

# 4. Export for analysis (optional)
node dist/cli.js index:export
```

## Quick Reference Card

```bash
# === GETTING IMPORTANT PAPERS ONLY ===
node dist/cli.js scrape-important -t survey -n 30        # Surveys
node dist/cli.js scrape-important -t conference -n 50    # Conference
node dist/cli.js scrape-important -t with-code -n 40     # With code
node dist/cli.js scrape-important --weekly              # Week's best
node dist/cli.js scrape-important --analyze             # Analyze DB

# === PROVEN HIGH-VALUE SEARCHES ===
node dist/cli.js search "accepted NeurIPS" -l 50 -d     # NeurIPS papers
node dist/cli.js search "github.com" -l 50 -d           # Papers w/ code
node dist/cli.js search "survey" -l 30 -d               # Survey papers

# === BASIC OPERATIONS ===
node dist/cli.js scrape -c cs.AI -m 100                 # Basic scrape
node dist/cli.js sync                                   # Update
node dist/cli.js stats                                  # Statistics
node dist/cli.js download -l 50                         # Download PDFs

# === INDEX OPERATIONS ===
node dist/cli.js index:export                           # Create Parquet
node dist/cli.js index:query -s "transformer"           # Query index
node dist/cli.js index:stats                            # Index stats

# === ARWEAVE UPLOAD ===
node dist/cli.js upload:batch -b 10                     # Upload batch
node dist/cli.js upload:all                             # Upload all
node dist/cli.js upload:status                          # Check status
node dist/cli.js upload:verify                          # Verify txs
node dist/cli.js upload:cost -s 2                       # Estimate cost
```

## Support & Debugging

### Check System Status
```bash
# View current statistics
node dist/cli.js stats

# Check recent logs
tail -n 100 combined.log

# Monitor real-time progress
tail -f combined.log
```

### Database Info
- **SQLite (arxiv.db)**: Working database for scraping
- **Parquet (index/*.parquet)**: Optimized for queries and Arweave
- **Downloads (downloads/category/*.pdf)**: Organized PDFs

### Performance Monitoring
```bash
# Check database size
ls -lh arxiv.db

# Check download folder size
du -sh downloads/

# Check index size
du -sh index/

# Count PDFs
find downloads -name "*.pdf" | wc -l
```