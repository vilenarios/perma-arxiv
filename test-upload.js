// Quick test to verify upload configuration

const fs = require('fs');
const path = require('path');

const WALLET_PATH = 'C:\\source\\arweave-keyfile-iKryOeZQMONi2965nKz528htMMN_sBcjlhc-VncoRjA.json';

console.log('Testing ArXiv Scraper Upload Configuration\n');
console.log('=' .repeat(50));

// Check wallet file
console.log('\n1. Wallet Configuration:');
if (fs.existsSync(WALLET_PATH)) {
    console.log('   ✅ Wallet file found at:', WALLET_PATH);
    try {
        const wallet = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));
        console.log('   ✅ Wallet is valid JSON');
        if (wallet.kty && wallet.n && wallet.e) {
            console.log('   ✅ Wallet has required JWK fields');
        }
    } catch (e) {
        console.log('   ❌ Error reading wallet:', e.message);
    }
} else {
    console.log('   ❌ Wallet file not found at:', WALLET_PATH);
}

// Check Parquet files
console.log('\n2. Parquet Index Files:');
const indexDir = path.join(__dirname, 'index');
if (fs.existsSync(indexDir)) {
    const files = fs.readdirSync(indexDir);
    const parquetFiles = files.filter(f => f.endsWith('.parquet') && !f.startsWith('backup_'));

    if (parquetFiles.length > 0) {
        console.log(`   ✅ Found ${parquetFiles.length} Parquet file(s):`);
        parquetFiles.forEach(f => {
            const stats = fs.statSync(path.join(indexDir, f));
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`      - ${f} (${sizeMB} MB)`);
        });
    } else {
        console.log('   ❌ No Parquet files found');
        console.log('      Run "npm run index:export" to create them');
    }
} else {
    console.log('   ❌ Index directory not found');
    console.log('      Run "npm run index:export" to create it');
}

// Check database
console.log('\n3. Database Status:');
const dbPath = path.join(__dirname, 'arxiv.db');
if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`   ✅ Database found: arxiv.db (${sizeMB} MB)`);
} else {
    console.log('   ❌ Database not found');
    console.log('      Run scraping commands first');
}

// Check downloaded papers
console.log('\n4. Downloaded Papers:');
const downloadsDir = path.join(__dirname, 'downloads');
if (fs.existsSync(downloadsDir)) {
    let pdfCount = 0;
    let totalSize = 0;

    function countPDFs(dir) {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const itemPath = path.join(dir, item);
            const stats = fs.statSync(itemPath);
            if (stats.isDirectory()) {
                countPDFs(itemPath);
            } else if (item.endsWith('.pdf')) {
                pdfCount++;
                totalSize += stats.size;
            }
        });
    }

    countPDFs(downloadsDir);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`   ✅ Found ${pdfCount} PDF files (${totalSizeMB} MB total)`);
} else {
    console.log('   ❌ Downloads directory not found');
}

// Check web viewer
console.log('\n5. Web Viewer:');
const webDir = path.join(__dirname, 'web');
if (fs.existsSync(webDir)) {
    const viewers = [
        'arxiv-viewer.html',
        'arxiv-viewer-standalone.html',
        'deploy.js'
    ];

    viewers.forEach(file => {
        if (fs.existsSync(path.join(webDir, file))) {
            console.log(`   ✅ ${file} found`);
        } else {
            console.log(`   ❌ ${file} not found`);
        }
    });
} else {
    console.log('   ❌ Web directory not found');
}

console.log('\n' + '=' .repeat(50));
console.log('\n📋 Next Steps:\n');

console.log('1. Check upload status:');
console.log('   npm run upload:status\n');

console.log('2. Upload papers to Arweave:');
console.log('   node dist/cli.js upload:batch --dry-run    # Test first');
console.log('   node dist/cli.js upload:batch -b 10        # Upload 10 papers\n');

console.log('3. Deploy web viewer to Arweave:');
console.log('   npm run web:deploy\n');

console.log('4. View locally:');
console.log('   npm run web:serve');
console.log('   Then load a Parquet file in the viewer\n');

console.log('✅ Configuration test complete!');