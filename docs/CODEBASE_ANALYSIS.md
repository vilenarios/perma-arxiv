# ArXiv Scraper - Codebase Structure Analysis

## Executive Summary

Your codebase currently mixes **backend CLI tools** with **frontend web app** in a single repository. While this is manageable, there are organizational issues and opportunities for cleanup.

---

## Current Directory Structure

### ✅ CLEAN - Backend CLI (Scraper/Uploader)

```
src/                          # TypeScript source code (Backend CLI)
├── api/                      # ArXiv API client
├── arweave/                  # Arweave upload & ArNS management
├── config/                   # Configuration & environment variables
├── database/                 # SQLite operations
├── downloader/               # PDF/HTML downloader
├── importance/               # Paper importance scoring
├── index/                    # Parquet export & DuckDB querying
├── scraper/                  # Paper scraping logic
├── types/                    # TypeScript type definitions
├── utils/                    # Logging, health checks
├── workflows/                # Deployment workflows
├── cli.ts                    # Main CLI entry point (952 lines)
└── index.ts                  # Library exports
```

**Purpose**: Backend scraper/uploader CLI tool
**Built Output**: `dist/` (compiled JavaScript)
**Entry Point**: `node dist/cli.js <command>`

---

### ✅ CLEAN - Frontend Web App

```
arxiv-app/                    # React + Vite web application
├── src/                      # React source code
│   ├── components/          # React components
│   ├── lib/                 # DuckDB WASM integration
│   ├── pages/               # Page components
│   ├── types/               # TypeScript types
│   ├── App.tsx              # Main app component
│   └── main.tsx             # React entry point
├── dist/                     # Built web app (for deployment)
├── public/                   # Static assets
├── package.json              # Web app dependencies (separate from CLI)
├── vite.config.ts            # Vite build configuration
└── tsconfig.json             # Web app TypeScript config
```

**Purpose**: Frontend web viewer for browsing papers
**Built Output**: `arxiv-app/dist/` (static HTML/JS/CSS)
**Deployment**: Uploaded to Arweave via `node dist/cli.js web:deploy arxiv-app/dist`

---

### ⚠️ RUNTIME DATA - Should NOT be committed

```
downloads/                    # Downloaded PDFs organized by category
├── cs/                       # Computer science papers
├── math/                     # Math papers
├── physics/                  # Physics papers
└── ... (155+ category folders)

index/                        # Generated Parquet files
├── arxiv_index_0.parquet    # 10MB parquet export
└── metadata.json             # Export metadata

arxiv.db                      # 25MB SQLite database (source of truth)
combined.log                  # 26MB application logs
error.log                     # 5MB error logs
```

**Status**: Correctly listed in `.gitignore` ✅
**Purpose**: Runtime data, regenerated from scraping/exports

---

### ✅ BUILD ARTIFACTS - Should NOT be committed

```
dist/                         # Compiled TypeScript → JavaScript (CLI)
├── api/
├── arweave/
├── ... (mirrors src/ structure)
├── cli.js                    # Compiled CLI entry point
└── cli.js.map                # Source maps
```

**Status**: Correctly listed in `.gitignore` ✅
**Purpose**: Build output from `npm run build` (compiles `src/` → `dist/`)

---

### 🧹 LEGACY/UTILITY - Minor cleanup needed

```
scripts/                      # Old utility scripts
├── convert-to-json.js       # Legacy conversion script
└── create-sharded-index.js  # Old indexing script

tests/                        # Manual test scripts (not a test suite)
├── test-conference.js
├── test-duckdb.js
├── test-upload.js
└── ... (8 test files)
```

**Recommendation**: Archive or move to `dev-utils/` folder

---

## Issues Identified

### 1. 🔴 CRITICAL: Large Log Files Committed

```
combined.log  - 26MB
error.log     - 5MB
```

**Problem**: Log files are in `.gitignore` but already committed to git
**Solution**: Remove from git history

### 2. 🟡 MODERATE: Confusing `index/` naming

```
src/index/              # Parquet export module
index/                  # Parquet data files
src/index.ts            # Library exports
```

**Problem**: Three different "index" concepts
**Solution**: Rename `src/index/` → `src/parquet/` or `src/export/`

### 3. 🟡 MODERATE: Mixed concerns in root directory

```
Root contains:
- CLI source code (src/)
- Web app (arxiv-app/)
- Runtime data (downloads/, index/, arxiv.db)
- Documentation (4 markdown files)
- Scripts and tests
```

**Problem**: Cluttered root directory
**Solution**: See recommendations below

### 4. 🟢 MINOR: Orphaned references in package.json

```json
"web:bundle": "node web/bundle-duckdb.js",
"web:deploy": "node web/deploy.js",
"web:serve": "npx http-server web -o",
```

**Problem**: `web/` directory doesn't exist (replaced by `arxiv-app/`)
**Solution**: Remove obsolete scripts

---

## Recommended Project Structure

### Option A: Monorepo (Keep Everything Together)

```
arxiv-scraper/
├── packages/
│   ├── cli/                          # Backend scraper/uploader
│   │   ├── src/
│   │   ├── dist/                     # gitignored
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                          # Frontend web app
│       ├── src/
│       ├── dist/                     # gitignored
│       ├── package.json
│       └── vite.config.ts
│
├── data/                              # Runtime data (gitignored)
│   ├── downloads/
│   ├── parquet/
│   ├── logs/
│   └── arxiv.db
│
├── docs/
│   ├── ADMIN_GUIDE.md
│   ├── CLAUDE.md
│   └── README.md
│
├── scripts/                          # Dev utilities
│   └── ... (old scripts)
│
├── .gitignore                        # Root gitignore
├── package.json                      # Root workspace config
└── README.md                         # Main readme
```

**Benefits**:
- Clear separation of CLI vs Web
- Centralized data folder
- Easy to share types between packages
- Professional monorepo structure

---

### Option B: Keep Current Structure (With Cleanup)

```
arxiv-scraper/
├── src/                              # Backend CLI source
│   ├── api/
│   ├── arweave/
│   ├── config/
│   ├── database/
│   ├── downloader/
│   ├── importance/
│   ├── parquet/                     # RENAMED from index/
│   ├── scraper/
│   ├── types/
│   ├── utils/
│   ├── workflows/
│   └── cli.ts
│
├── arxiv-app/                        # Frontend web app (unchanged)
│   ├── src/
│   ├── dist/
│   └── package.json
│
├── data/                             # NEW: Centralized data folder
│   ├── downloads/                   # MOVED from ./downloads
│   ├── parquet/                     # MOVED from ./index
│   ├── logs/                        # MOVED from ./*.log
│   └── arxiv.db                     # MOVED from ./arxiv.db
│
├── docs/                             # NEW: Documentation folder
│   ├── ADMIN_GUIDE.md
│   ├── ARXIV_DESIGN_ANALYSIS.md
│   ├── CLAUDE.md
│   └── CODEBASE_ANALYSIS.md
│
├── dev-utils/                        # RENAMED from scripts/tests
│   ├── scripts/
│   └── tests/
│
├── dist/                             # CLI build output (gitignored)
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

**Benefits**:
- Minimal changes
- Clear data folder
- Clean documentation
- Still separates CLI from Web

---

## Immediate Action Items

### 🔴 HIGH PRIORITY

1. **Remove committed log files from git**
   ```bash
   git rm --cached combined.log error.log
   git commit -m "chore: Remove log files from git history"
   ```

2. **Update package.json scripts** (remove obsolete web/ references)
   ```json
   // REMOVE these lines:
   "web:bundle": "node web/bundle-duckdb.js",
   "web:deploy": "node web/deploy.js",
   "web:serve": "npx http-server web -o",
   ```

3. **Update .gitignore** to ensure logs are ignored
   ```gitignore
   # Already present, but verify:
   *.log
   combined.log
   error.log
   ```

### 🟡 MEDIUM PRIORITY

4. **Rename `src/index/` → `src/parquet/`** to reduce confusion
   - Update all imports
   - Update CLAUDE.md documentation

5. **Consider creating `data/` folder** for runtime files
   - Move `downloads/` → `data/downloads/`
   - Move `index/` → `data/parquet/`
   - Move `arxiv.db` → `data/arxiv.db`
   - Move logs → `data/logs/`
   - Update `.env` paths
   - Update config in `src/config/index.ts`

6. **Create `docs/` folder** for documentation
   - Move all `*.md` files except README.md

### 🟢 LOW PRIORITY

7. **Clean up old scripts**
   - Archive `scripts/` and `tests/` to `dev-utils/` or delete

8. **Consider monorepo structure** for future scalability

---

## Current State Assessment

### ✅ What's Working Well

1. **Clear separation of CLI and Web**: `src/` vs `arxiv-app/`
2. **Proper gitignore**: Build artifacts and data files excluded
3. **Good documentation**: Multiple markdown guides
4. **Dual database architecture**: SQLite + Parquet well organized

### ⚠️ What Needs Improvement

1. **Confusing naming**: Multiple "index" concepts
2. **Root directory clutter**: Too many files in root
3. **Committed log files**: Should be removed
4. **Obsolete scripts**: References to deleted `web/` folder

---

## Questions to Consider

1. **Do you want a monorepo structure?**
   - Pro: Cleaner separation, professional structure
   - Con: More upfront refactoring work

2. **Should runtime data be in a `data/` folder?**
   - Pro: Cleaner root directory
   - Con: Need to update all config paths

3. **Are the old scripts/tests still needed?**
   - If yes: Move to `dev-utils/`
   - If no: Delete them

---

## Summary

**Current Structure**: Mostly clean, but has some organizational debt

**Main Issues**:
- Committed log files (26MB + 5MB)
- Confusing "index" naming collision
- Obsolete package.json scripts
- Root directory clutter

**Recommended Next Steps**:
1. Remove log files from git (immediate)
2. Clean up package.json scripts (5 minutes)
3. Decide on Option A (monorepo) or Option B (cleanup current structure)
4. Implement chosen structure (1-2 hours)

Your codebase has a solid foundation with good separation between CLI and Web. With these improvements, it will be much cleaner and easier to maintain!
