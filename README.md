# ArXiv Scraper

A robust ArXiv paper scraper built with Node.js and TypeScript that intelligently downloads only the most important academic papers. Features smart filtering to identify high-impact research, conference papers, and papers with code implementations.

## Key Features

### 🎯 Smart Importance Detection
- **Automatic Paper Scoring**: Identifies important papers using metadata signals (conferences, journals, citations, code availability)
- **Selective Scraping**: Download only the top 1-5% of papers instead of everything
- **Multiple Filter Types**: Conference papers, journal publications, surveys, papers with code

### 🚀 Core Capabilities
- **Robust Error Handling**: Automatic retries with exponential backoff
- **Rate Limiting**: Respects ArXiv API limits
- **Incremental Sync**: Only downloads new papers since last sync
- **PDF Download Management**: Organized storage with resume support
- **Dual Database Architecture**: SQLite for scraping, Parquet/DuckDB for analytics
- **Full-Text Search**: Search across titles, summaries, and authors
- **Arweave Ready**: Parquet format optimized for permanent decentralized storage

## Installation

```bash
# Clone the repository
git clone https://github.com/vilenarios/perma-arxiv.git
cd perma-arxiv

# Install dependencies
npm install

# Build TypeScript
npm run build
```

## Quick Start

### Get Only Important Papers (Recommended)

```bash
# 1. Analyze what's important (no downloads)
node dist/cli.js scrape-important --analyze

# 2. Get survey papers (highest value)
node dist/cli.js scrape-important -t survey -n 30

# 3. Get conference papers (NeurIPS, ICML, etc.)
node dist/cli.js scrape-important -t conference -n 50

# 4. Get papers with code
node dist/cli.js scrape-important -t with-code -n 40

# Result: ~120 high-quality papers instead of 10,000+
```

### Traditional Scraping

```bash
# Basic scrape
node dist/cli.js scrape -c cs.AI cs.LG -m 100

# Search specific papers
node dist/cli.js search "transformer" -l 20 -d

# Incremental sync
node dist/cli.js sync
```

## Smart Importance Scoring

The scraper scores papers from 0-50+ points based on:

| Signal | Points | Example |
|--------|--------|---------|
| **Top Conference** | 20 | "Accepted NeurIPS 2024" |
| **Journal Publication** | 8 | "Nature Machine Intelligence" |
| **Survey/Review** | 7 | "A Comprehensive Survey of..." |
| **Has Code** | 5 | "github.com/..." |
| **Multiple Versions** | 2-6 | v3, v4, v5 |
| **Important Keywords** | 3-5 | "state-of-the-art" |

## Core Commands

### Importance-Based Scraping

```bash
# Get only important papers (score 10+)
node dist/cli.js scrape-important [options]

Options:
  -t conference    # Only conference papers
  -t journal       # Only journal publications
  -t survey        # Only surveys/reviews
  -t with-code     # Only papers with code
  -s <score>       # Minimum importance score (default: 10)
  -n <number>      # Maximum papers to collect
  --weekly         # Top papers from this week
  --analyze        # Analyze existing database
```

### Search Commands

```bash
# Search and download
node dist/cli.js search <query> -l <limit> -d

# Proven high-value searches
node dist/cli.js search "accepted NeurIPS" -l 50 -d
node dist/cli.js search "github.com" -l 50 -d
node dist/cli.js search "survey" -l 30 -d
```

### Database & Index

```bash
# Export to Parquet (for analytics/Arweave)
node dist/cli.js index:export

# Query with DuckDB (fast!)
node dist/cli.js index:query -s "transformer"

# View statistics
node dist/cli.js stats
```

### Arweave Upload

```bash
# Upload papers to Arweave
node dist/cli.js upload:batch -b 10    # Upload 10 papers
node dist/cli.js upload:all            # Upload everything
node dist/cli.js upload:status         # Check upload progress
node dist/cli.js upload:verify         # Verify transactions
node dist/cli.js upload:cost -s 2      # Estimate cost for 2MB
```

## Recommended Strategies

### Minimal High-Impact Set (~50 papers)
```bash
node dist/cli.js scrape-important -s 20 -n 30
node dist/cli.js search "comprehensive survey" -l 20 -d
```

### Weekly Updates (~20 papers/week)
```bash
node dist/cli.js scrape-important --weekly
```

### Research Collection (~500 papers)
```bash
node dist/cli.js scrape-important -t conference -n 100
node dist/cli.js scrape-important -t journal -n 100
node dist/cli.js scrape-important -t survey -n 50
node dist/cli.js scrape-important -t with-code -n 250
```

## Database Architecture

The scraper uses two database systems:

1. **SQLite** (`arxiv.db`) - For active scraping and state management
2. **Parquet/DuckDB** (`index/*.parquet`) - For fast analytics and Arweave preparation

```bash
# Workflow
Scrape → SQLite → Export → Parquet → Query with DuckDB → Upload to Arweave
```

## Project Structure

```
arxiv-scraper/
├── dist/              # Compiled JavaScript
├── downloads/         # PDFs organized by category
├── index/             # Parquet files for analytics
├── src/               # TypeScript source
│   ├── api/          # ArXiv API client
│   ├── arweave/      # Arweave upload system
│   ├── database/     # SQLite layer
│   ├── downloader/   # PDF downloader
│   ├── importance/   # Smart filtering system
│   ├── index/        # Parquet/DuckDB
│   └── scraper/      # Core scraping logic
├── arxiv.db          # SQLite database
├── wallet.json       # Arweave wallet (not committed)
├── ADMIN_GUIDE.md    # Detailed documentation
└── package.json
```

## Advanced Features

### Parquet Export for Arweave
```bash
# Export entire database to Parquet
node dist/cli.js index:export

# Files ready for Arweave upload:
# - index/*.parquet (metadata)
# - downloads/**/*.pdf (papers)
```

### Full-Text Search in Parquet
```bash
# Fast queries with DuckDB
node dist/cli.js index:query -s "neural network" -c cs.LG
node dist/cli.js index:query --start-date 2024-01-01
```

### Find Similar Papers
```bash
node dist/cli.js index:similar 2401.12345 -l 10
```

## Storage Estimates

| Strategy | Papers | Storage |
|----------|--------|---------|
| Minimal High-Impact | 50 | ~100MB |
| Weekly Updates | 100/month | ~200MB/month |
| Research Set | 500 | ~1GB |
| Comprehensive | 1000 | ~2GB |

## Troubleshooting

### Common Issues

1. **"No new papers since last sync"** - This is normal! Use non-incremental scrape if you want to force downloads.

2. **TypeScript errors** - Run `npm run build` or `npx tsc` to recompile.

3. **Rate limiting** - Reduce batch size: `node dist/cli.js scrape -m 20`

4. **Memory issues** - Use smaller batches: `node dist/cli.js index:export -b 1000`

## Arweave Integration

The scraper includes full Arweave upload support using the ArDrive Turbo SDK:

### Setup
```bash
# 1. Get an Arweave wallet (JWK format)
# 2. Fund it with AR tokens
# 3. Place wallet.json in project root
```

### Upload Flow
```bash
# 1. Check balance and costs
node dist/cli.js upload:cost -s 2  # Estimate for 2MB file

# 2. Upload in batches
node dist/cli.js upload:batch -b 10 --dry-run  # Test first
node dist/cli.js upload:batch -b 10            # Actually upload

# 3. Or upload everything
node dist/cli.js upload:all -b 20 -d 5000

# 4. Check status
node dist/cli.js upload:status

# 5. Verify on Arweave
node dist/cli.js upload:verify
```

### Features
- Transaction IDs stored in both SQLite and Parquet
- Automatic retry for failed uploads
- Progress tracking and resumable uploads
- Cost estimation before uploading
- Verification of uploaded content

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Documentation

For comprehensive documentation including all commands, options, and strategies, see [ADMIN_GUIDE.md](ADMIN_GUIDE.md).

## License

MIT

## Acknowledgments

Built to make ArXiv's valuable research more accessible while respecting their API limits and focusing on quality over quantity.