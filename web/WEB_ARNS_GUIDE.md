# Web Viewer ArNS Integration Guide

## Overview

This guide explains how to configure your ArXiv web viewer to automatically load data from your ArNS domain instead of hardcoded transaction IDs.

## Current Architecture

Currently, users must manually:
1. Load a local Parquet file, OR
2. Enter an Arweave transaction ID manually

## Recommended ArNS Architecture

With ArNS, the viewer should automatically load from `https://data_arxiv.arweave.net`

## Implementation Options

### Option 1: Auto-load from ArNS (Recommended)

Modify your viewer HTML to automatically fetch from ArNS on page load:

```javascript
// In your viewer initialization code
async function initializeViewer() {
    showStatus('Loading latest ArXiv data from ArNS...');

    try {
        // Load from ArNS - no transaction ID needed!
        const response = await fetch('https://data_arxiv.arweave.net');

        if (!response.ok) {
            throw new Error('Failed to load from ArNS');
        }

        const blob = await response.blob();
        const file = new File([blob], 'arxiv.parquet', { type: 'application/octet-stream' });

        // Load into DuckDB
        const conn = await db.connect();
        await conn.insertArrowFromIPCStream(await file.arrayBuffer(), {
            name: 'papers'
        });

        showStatus('Data loaded successfully!');
        await refreshStats();
        await searchPapers();

    } catch (error) {
        console.error('Failed to auto-load from ArNS:', error);
        showStatus('Please load a Parquet file or enter a transaction ID manually');
    }
}

// Call on page load
window.addEventListener('load', initializeViewer);
```

### Option 2: ArNS as Default Option

Add ArNS as a default option in the UI:

```html
<div class="control-row">
    <button onclick="loadFromArNS()" class="primary-btn">
        🌐 Load Latest from ArNS
    </button>
    <input type="file" id="parquetFile" accept=".parquet">
    <label for="parquetFile">📂 Or Load Local File</label>
</div>

<script>
async function loadFromArNS() {
    try {
        document.getElementById('status').textContent = 'Loading from ArNS...';

        const response = await fetch('https://data_arxiv.arweave.net');
        const blob = await response.blob();
        const file = new File([blob], 'arxiv.parquet', { type: 'application/octet-stream' });

        // Process file (use existing file processing logic)
        await processParquetFile(file);

    } catch (error) {
        alert('Failed to load from ArNS: ' + error.message);
    }
}
</script>
```

### Option 3: Configuration-based Loading

Allow users to configure which ArNS domain to use:

```javascript
const CONFIG = {
    // Default ArNS domain for data
    arnsDataDomain: 'https://data_arxiv.arweave.net',

    // Fallback to specific gateway if needed
    arweaveGateway: 'https://arweave.net',

    // Enable auto-load on page start
    autoLoadFromArNS: true
};

async function loadParquetData() {
    let dataUrl = CONFIG.arnsDataDomain;

    // Try ArNS first
    try {
        const response = await fetch(dataUrl);
        if (response.ok) {
            return await response.blob();
        }
    } catch (error) {
        console.warn('ArNS load failed, trying fallback...', error);
    }

    // Fallback to user input if needed
    throw new Error('Could not load data from ArNS');
}
```

## Benefits of ArNS Integration

1. **No Manual Updates**: Users don't need to know transaction IDs
2. **Always Current**: Automatically loads the latest data when you update ArNS
3. **User-Friendly**: Single click to load latest data
4. **Persistent URLs**: Your data URL never changes
5. **Gateway Independent**: Works across AR.IO gateway network

## Deployment Workflow

1. Export new Parquet data: `npm run build && node dist/cli.js index:export`
2. Upload to Arweave: `node dist/cli.js index:export-upload`
3. ArNS automatically updates to point to new data
4. Web viewer automatically loads latest data (no changes needed!)

## Testing

Test your ArNS configuration:

```bash
# Check current ArNS configuration
node dist/cli.js arns:status

# Test ArNS accessibility
curl -I https://data_arxiv.arweave.net

# Test in browser console
fetch('https://data_arxiv.arweave.net').then(r => console.log(r.status))
```

## Recommended File Changes

### For arxiv-viewer.html:

1. Add ArNS auto-load on page initialization
2. Update the "Load from Arweave" input to be "Load from Specific TX" (for backwards compatibility)
3. Add a prominent "🌐 Load Latest" button that loads from ArNS
4. Show ArNS domain in the UI footer: "Data from: data_arxiv.arweave.net"

### Example Footer:

```html
<footer style="text-align: center; padding: 20px; color: var(--text-secondary); font-size: 12px;">
    <p>
        Data loaded from: <a href="https://data_arxiv.arweave.net" target="_blank">data_arxiv.arweave.net</a>
        <br>
        Powered by <a href="https://ar.io" target="_blank">AR.IO</a> ArNS
    </p>
</footer>
```

## Migration Path

1. **Phase 1**: Add ArNS button alongside existing manual load options
2. **Phase 2**: Make ArNS the default, keep manual load as fallback
3. **Phase 3**: Auto-load from ArNS on page load, manual load available if needed

## Security Considerations

- ArNS domains are controlled by ANT (Arweave Name Token) owners
- Only the wallet that owns the ANT can update ArNS records
- AR.IO gateways verify ANT ownership before serving content
- Your data remains on Arweave even if ArNS record changes

## Support

If you encounter issues:
1. Check ArNS configuration: `node dist/cli.js arns:status`
2. Test ArNS accessibility: `node dist/cli.js arns:test`
3. Verify ANT Process IDs are set in `.env`
4. Ensure your wallet controls the ANT for data_arxiv
