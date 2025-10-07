#!/usr/bin/env node

/**
 * Deploy ArXiv viewer and data to Arweave
 *
 * This script:
 * 1. Uploads the HTML viewer to Arweave
 * 2. Uploads Parquet files to Arweave
 * 3. Creates a manifest linking everything together
 */

import { TurboFactory } from '@ardrive/turbo-sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const WALLET_PATH = process.env.ARWEAVE_WALLET_PATH || './wallet.json';
const HTML_PATH = path.join(__dirname, 'arxiv-viewer.html');
const PARQUET_DIR = path.join(__dirname, '..', 'index');

// For scalability: combine multiple Parquet files into one if needed
const COMBINE_PARQUET = true;  // Combine into single file for easier access
const MAX_PARQUET_SIZE_MB = 500; // Keep under 500MB for fast loading

async function deploy() {
    console.log('🚀 Starting Arweave deployment...\n');

    // Initialize Turbo
    console.log('📦 Initializing Turbo SDK...');
    const jwk = JSON.parse(await fs.readFile(WALLET_PATH, 'utf-8'));
    const turbo = TurboFactory.authenticated({ privateKey: jwk });

    // Check balance
    const balance = await turbo.getBalance();
    console.log(`💰 Current balance: ${balance.winc} winc\n`);

    // Upload HTML viewer
    console.log('📄 Uploading HTML viewer...');
    const htmlContent = await fs.readFile(HTML_PATH);

    const htmlResult = await turbo.uploadFile({
        fileStreamFactory: () => htmlContent,
        fileSizeFactory: () => htmlContent.length,
        dataItemOpts: {
            tags: [
                { name: 'Content-Type', value: 'text/html' },
                { name: 'App-Name', value: 'arxiv-viewer' },
                { name: 'App-Version', value: '1.0.0' },
                { name: 'Title', value: 'ArXiv Paper Archive Viewer' }
            ]
        }
    });

    console.log(`✅ HTML uploaded: https://arweave.net/${htmlResult.id}`);

    // Find and upload Parquet files
    console.log('\n📊 Finding Parquet files...');
    const files = await fs.readdir(PARQUET_DIR);
    const parquetFiles = files.filter(f => f.endsWith('.parquet') && !f.startsWith('backup_'));

    if (parquetFiles.length === 0) {
        console.log('❌ No Parquet files found in index directory');
        console.log('   Run "npm run index:export" first to create Parquet files');
        return;
    }

    console.log(`Found ${parquetFiles.length} Parquet file(s)\n`);

    const parquetTxIds = {};

    for (const fileName of parquetFiles) {
        console.log(`📤 Uploading ${fileName}...`);
        const filePath = path.join(PARQUET_DIR, fileName);
        const fileContent = await fs.readFile(filePath);

        const result = await turbo.uploadFile({
            fileStreamFactory: () => fileContent,
            fileSizeFactory: () => fileContent.length,
            dataItemOpts: {
                tags: [
                    { name: 'Content-Type', value: 'application/octet-stream' },
                    { name: 'App-Name', value: 'arxiv-viewer' },
                    { name: 'Data-Type', value: 'parquet' },
                    { name: 'File-Name', value: fileName }
                ]
            }
        });

        parquetTxIds[fileName] = result.id;
        console.log(`✅ Uploaded: https://arweave.net/${result.id}`);

        // Small delay between uploads
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Create deployment manifest
    console.log('\n📝 Creating deployment manifest...');
    const manifest = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        viewer: {
            url: `https://arweave.net/${htmlResult.id}`,
            txId: htmlResult.id
        },
        data: Object.entries(parquetTxIds).map(([fileName, txId]) => ({
            fileName,
            url: `https://arweave.net/${txId}`,
            txId
        })),
        instructions: [
            `1. Open the viewer: https://arweave.net/${htmlResult.id}`,
            `2. Enter Parquet transaction ID: ${Object.values(parquetTxIds)[0]}`,
            '3. Click "Load from Arweave" to start browsing papers'
        ]
    };

    // Save manifest locally
    const manifestPath = path.join(__dirname, 'deployment-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // Upload manifest to Arweave
    const manifestContent = Buffer.from(JSON.stringify(manifest, null, 2));
    const manifestResult = await turbo.uploadFile({
        fileStreamFactory: () => manifestContent,
        fileSizeFactory: () => manifestContent.length,
        dataItemOpts: {
            tags: [
                { name: 'Content-Type', value: 'application/json' },
                { name: 'App-Name', value: 'arxiv-viewer' },
                { name: 'Data-Type', value: 'manifest' }
            ]
        }
    });

    console.log(`✅ Manifest uploaded: https://arweave.net/${manifestResult.id}`);

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 DEPLOYMENT COMPLETE!');
    console.log('='.repeat(60));
    console.log('\n📋 Deployment Summary:\n');
    console.log(`Viewer URL: https://arweave.net/${htmlResult.id}`);
    console.log(`Manifest: https://arweave.net/${manifestResult.id}`);
    console.log('\nParquet Files:');
    Object.entries(parquetTxIds).forEach(([fileName, txId]) => {
        console.log(`  - ${fileName}: ${txId}`);
    });
    console.log('\n🚀 To use your archive:');
    console.log(`1. Open: https://arweave.net/${htmlResult.id}`);
    console.log(`2. Enter this transaction ID: ${Object.values(parquetTxIds)[0]}`);
    console.log('3. Click "Load from Arweave"\n');
    console.log('Your ArXiv archive is now permanently stored on Arweave! 🎊');
}

// Run deployment
deploy().catch(error => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
});