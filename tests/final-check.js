#!/usr/bin/env node

/**
 * Final system check before deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 FINAL SYSTEM CHECK\n');
console.log('=' .repeat(60) + '\n');

let errors = [];
let warnings = [];

// 1. Check wallet file
console.log('1. Checking wallet configuration...');
const WALLET_PATH = 'C:\\source\\arweave-keyfile-iKryOeZQMONi2965nKz528htMMN_sBcjlhc-VncoRjA.json';

if (!fs.existsSync(WALLET_PATH)) {
    errors.push('❌ Wallet file not found at: ' + WALLET_PATH);
} else {
    try {
        const wallet = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));
        if (wallet.kty && wallet.n && wallet.e) {
            console.log('   ✅ Wallet file is valid');
        } else {
            errors.push('❌ Wallet file is missing required JWK fields');
        }
    } catch (e) {
        errors.push('❌ Wallet file is not valid JSON: ' + e.message);
    }
}

// 2. Check build
console.log('\n2. Checking TypeScript build...');
try {
    execSync('npm run build', { stdio: 'pipe' });
    console.log('   ✅ TypeScript builds successfully');
} catch (e) {
    errors.push('❌ TypeScript build failed');
}

// 3. Check database
console.log('\n3. Checking database...');
if (fs.existsSync('arxiv.db')) {
    const stats = fs.statSync('arxiv.db');
    console.log(`   ✅ Database exists (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
} else {
    warnings.push('⚠️  No database found - run scraper first');
}

// 4. Check Parquet index
console.log('\n4. Checking Parquet index...');
if (fs.existsSync('index')) {
    const files = fs.readdirSync('index');
    const parquetFiles = files.filter(f => f.endsWith('.parquet') && !f.startsWith('backup_'));
    if (parquetFiles.length > 0) {
        console.log(`   ✅ Found ${parquetFiles.length} Parquet file(s)`);
        parquetFiles.forEach(f => {
            const size = fs.statSync(path.join('index', f)).size;
            console.log(`      - ${f} (${(size / 1024 / 1024).toFixed(2)} MB)`);
        });
    } else {
        warnings.push('⚠️  No Parquet files found - run index:export');
    }
} else {
    warnings.push('⚠️  Index directory not found');
}

// 5. Check downloads
console.log('\n5. Checking downloaded papers...');
if (fs.existsSync('downloads')) {
    let pdfCount = 0;
    function countPDFs(dir) {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const itemPath = path.join(dir, item);
            if (fs.statSync(itemPath).isDirectory()) {
                countPDFs(itemPath);
            } else if (item.endsWith('.pdf')) {
                pdfCount++;
            }
        });
    }
    countPDFs('downloads');
    console.log(`   ✅ Found ${pdfCount} PDF files`);
} else {
    warnings.push('⚠️  No downloads directory found');
}

// 6. Check DuckDB bundle
console.log('\n6. Checking DuckDB bundle...');
if (fs.existsSync('web/duckdb-bundle')) {
    const bundleFiles = fs.readdirSync('web/duckdb-bundle');
    const expectedFiles = ['duckdb-mvp.wasm', 'duckdb-browser-mvp.worker.js', 'duckdb-browser.mjs'];
    let allPresent = true;
    expectedFiles.forEach(file => {
        if (!bundleFiles.includes(file)) {
            allPresent = false;
            errors.push(`❌ Missing bundle file: ${file}`);
        }
    });
    if (allPresent) {
        console.log('   ✅ DuckDB bundle is complete');
    }
} else {
    warnings.push('⚠️  DuckDB bundle not found - run npm run web:bundle');
}

// 7. Check bundled HTML
console.log('\n7. Checking bundled HTML viewer...');
if (fs.existsSync('web/arxiv-bundled.html')) {
    const size = fs.statSync('web/arxiv-bundled.html').size;
    console.log(`   ✅ Bundled viewer exists (${(size / 1024).toFixed(2)} KB)`);
} else {
    warnings.push('⚠️  Bundled viewer not found - run npm run web:bundle');
}

// 8. Check deployment scripts
console.log('\n8. Checking deployment scripts...');
const deployScripts = [
    'web/deploy.js',
    'web/smart-deploy.js',
    'web/bundle-duckdb.js'
];

deployScripts.forEach(script => {
    if (fs.existsSync(script)) {
        console.log(`   ✅ ${path.basename(script)} exists`);
    } else {
        errors.push(`❌ Missing deployment script: ${script}`);
    }
});

// 9. Check CLI commands
console.log('\n9. Checking CLI commands...');
try {
    execSync('node dist/cli.js --help', { stdio: 'pipe' });
    console.log('   ✅ CLI is working');
} catch (e) {
    errors.push('❌ CLI is not working');
}

// 10. Check npm scripts
console.log('\n10. Checking npm scripts...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const requiredScripts = ['build', 'web:bundle', 'index:export', 'upload:status'];
requiredScripts.forEach(script => {
    if (packageJson.scripts[script]) {
        console.log(`   ✅ npm run ${script} is configured`);
    } else {
        errors.push(`❌ Missing npm script: ${script}`);
    }
});

// Summary
console.log('\n' + '=' .repeat(60));
console.log('\n📊 SUMMARY\n');

if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ ALL SYSTEMS GO! Ready for deployment.\n');
    console.log('📋 Next steps:');
    console.log('1. Run scraper: node dist/cli.js scrape-important -n 1000');
    console.log('2. Export index: npm run index:export');
    console.log('3. Bundle viewer: npm run web:bundle');
    console.log('4. Deploy all: npm run deploy:complete\n');
} else {
    if (errors.length > 0) {
        console.log('❌ ERRORS (must fix):');
        errors.forEach(e => console.log('   ' + e));
    }

    if (warnings.length > 0) {
        console.log('\n⚠️  WARNINGS (should address):');
        warnings.forEach(w => console.log('   ' + w));
    }

    console.log('\n📋 Fix issues, then run deployment.');
}

console.log('\n' + '=' .repeat(60));

// Exit with error code if there are errors
process.exit(errors.length > 0 ? 1 : 0);