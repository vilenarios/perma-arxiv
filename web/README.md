# ArXiv Paper Archive Web Viewer

A web-based viewer for browsing ArXiv papers stored in Parquet format. Works both locally and when hosted on Arweave for permanent archival.

## 📋 Two Versions Available

### 1. **Full Version** (`arxiv-viewer.html`)
- Uses DuckDB-WASM to query Parquet files directly in browser
- Supports large datasets (GB+ of data)
- Full SQL query capabilities
- **Requires CDN access** for DuckDB-WASM library

### 2. **Standalone Version** (`arxiv-viewer-standalone.html`)
- **No external dependencies** - works offline
- Loads JSON data (converted from Parquet)
- Basic search and filtering
- Best for smaller datasets (<50MB)

## 🚀 Quick Start

### Option 1: Use Locally

1. Generate your Parquet index:
```bash
cd ..
npm run index:export
```

2. Open the viewer:
- **Full version**: Open `arxiv-viewer.html` in your browser
- **Standalone**: Convert Parquet to JSON first, then open `arxiv-viewer-standalone.html`

3. Load your data:
- Click "Load Local Parquet" and select your `index/arxiv_index_*.parquet` file
- Or enter an Arweave transaction ID if already uploaded

### Option 2: Deploy to Arweave

1. Set up your wallet:
```bash
# The wallet path is already configured in deploy.js
# Make sure your wallet has AR tokens
```

2. Deploy everything:
```bash
cd ..
npm run web:deploy
```

This will:
- Upload the HTML viewer to Arweave
- Upload all Parquet files to Arweave
- Create a manifest linking everything
- Give you permanent URLs for your archive

## 🎯 Features

### Search & Filter
- Full-text search across titles, abstracts, authors
- Filter by category
- Sort by date or title
- Pagination for large datasets

### Paper Information
- Title, authors, categories
- Publication and update dates
- Abstract/summary
- Links to ArXiv and PDFs
- Arweave transaction IDs for uploaded papers

### Views
- **Card View**: Rich paper cards with expandable abstracts
- **Table View**: Compact spreadsheet-like view (standalone only)

## 📦 Converting Parquet to JSON

For the standalone version, convert your Parquet files to JSON:

```javascript
// convert-to-json.js
const duckdb = require('duckdb');
const fs = require('fs');

const db = new duckdb.Database(':memory:');
const conn = db.connect();

conn.exec(`COPY (SELECT * FROM 'index/arxiv_index.parquet') TO 'papers.json' (FORMAT JSON)`, (err) => {
    if (err) console.error(err);
    else console.log('Converted to papers.json');
    conn.close();
    db.close();
});
```

## 🌐 Deployment Manifest

After deployment, you'll get a `deployment-manifest.json` with:
- Viewer URL
- Parquet file transaction IDs
- Instructions for accessing your archive

## 🔒 Permanent Archive

Once deployed to Arweave:
1. Your viewer HTML is permanent and immutable
2. Your Parquet data is permanently stored
3. No hosting costs or maintenance needed
4. Accessible forever via Arweave gateways

## 📊 Data Schema

The viewer expects Parquet/JSON with these fields:
- `id`: ArXiv paper ID
- `title`: Paper title
- `authors`: Author names
- `summary`: Abstract text
- `primary_category`: Main category
- `all_categories`: All categories (comma-separated)
- `published`: Publication date
- `updated`: Last update date
- `pdf_url`: Link to PDF
- `abstract_url`: Link to ArXiv page
- `transaction_id`: Arweave transaction ID (if uploaded)

## 🛠️ Customization

### Styling
Edit the CSS variables in the `<style>` section:
```css
:root {
    --primary: #2563eb;     /* Primary color */
    --bg: #ffffff;           /* Background */
    --text: #111827;         /* Text color */
}
```

### Page Size
Change `pageSize` in the JavaScript:
```javascript
const pageSize = 20; // Papers per page
```

### Add Custom Fields
Modify the display functions to show additional metadata from your Parquet files.

## 🚨 Troubleshooting

### "Cannot load Parquet file"
- Make sure you're using the correct viewer version
- For large files, use the full version with DuckDB-WASM
- Check browser console for specific errors

### "CDN unavailable"
- Use the standalone version with JSON data
- Or download DuckDB-WASM locally and modify script sources

### "Arweave transaction not found"
- Transactions can take a few minutes to propagate
- Try different gateways: arweave.net, arweave.dev, g8way.io

## 📝 License

MIT - Use freely for your ArXiv archive!