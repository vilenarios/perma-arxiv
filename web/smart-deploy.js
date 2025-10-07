#!/usr/bin/env node

/**
 * Smart deployment script for ArXiv archive
 *
 * This script:
 * 1. Uploads new papers to Arweave
 * 2. Updates the Parquet index with transaction IDs
 * 3. Uploads the updated Parquet to Arweave
 * 4. Creates an HTML viewer with the Parquet TX ID embedded
 * 5. Uploads the HTML viewer to Arweave
 *
 * Result: A permanent, self-contained archive on Arweave
 */

const { TurboFactory } = require('@ardrive/turbo-sdk');
const fs = require('fs/promises');
const path = require('path');
const { execSync } = require('child_process');

// __dirname is already available in CommonJS

// Get wallet path from environment variable or use default
const WALLET_PATH = process.env.ARWEAVE_WALLET_PATH || './wallet.json';

class SmartDeployer {
    constructor() {
        this.turbo = null;
        this.stats = {
            papersUploaded: 0,
            parquetTxId: null,
            htmlTxId: null,
            totalCost: 0
        };
    }

    async initialize() {
        console.log('🚀 Smart ArXiv Archive Deployment\n');
        console.log('=' .repeat(60) + '\n');

        const jwk = JSON.parse(await fs.readFile(WALLET_PATH, 'utf-8'));
        this.turbo = TurboFactory.authenticated({ privateKey: jwk });

        const balance = await this.turbo.getBalance();
        console.log(`💰 Wallet balance: ${balance.winc} winc\n`);
    }

    async step1_uploadNewPapers() {
        console.log('📄 Step 1: Upload new papers to Arweave');
        console.log('-' .repeat(40));

        // Check for papers without transaction IDs
        const result = execSync('node dist/cli.js upload:status', {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf-8'
        });

        const pendingMatch = result.match(/Pending: (\d+)/);
        const pendingCount = pendingMatch ? parseInt(pendingMatch[1]) : 0;

        if (pendingCount > 0) {
            console.log(`Found ${pendingCount} papers to upload\n`);

            // Upload in batches
            const batchSize = 50;
            const batches = Math.ceil(pendingCount / batchSize);

            for (let i = 0; i < batches; i++) {
                console.log(`Uploading batch ${i + 1}/${batches}...`);

                execSync(`node dist/cli.js upload:batch -b ${batchSize}`, {
                    cwd: path.join(__dirname, '..'),
                    stdio: 'inherit'
                });

                this.stats.papersUploaded += Math.min(batchSize, pendingCount - (i * batchSize));

                // Wait between batches
                if (i < batches - 1) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        } else {
            console.log('All papers already uploaded ✅\n');
        }
    }

    async step2_updateParquetIndex() {
        console.log('📊 Step 2: Update Parquet index with transaction IDs');
        console.log('-' .repeat(40));

        // The upload:batch command already updates the Parquet files
        // But we should regenerate to ensure everything is in sync

        execSync('node dist/cli.js index:export', {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit'
        });

        console.log('Parquet index updated ✅\n');
    }

    async step3_uploadParquet() {
        console.log('📤 Step 3: Upload Parquet index to Arweave');
        console.log('-' .repeat(40));

        // Find the latest Parquet file
        const indexDir = path.join(__dirname, '..', 'index');
        const files = await fs.readdir(indexDir);
        const parquetFiles = files.filter(f => f.endsWith('.parquet') && !f.startsWith('backup_'));

        if (parquetFiles.length === 0) {
            throw new Error('No Parquet files found');
        }

        // If multiple files, combine them (for simplicity, we'll use the largest)
        const parquetFile = parquetFiles[0];
        const filePath = path.join(indexDir, parquetFile);
        const fileContent = await fs.readFile(filePath);
        const fileSizeMB = (fileContent.length / (1024 * 1024)).toFixed(2);

        console.log(`Uploading ${parquetFile} (${fileSizeMB} MB)...`);

        const result = await this.turbo.uploadFile({
            fileStreamFactory: () => fileContent,
            fileSizeFactory: () => fileContent.length,
            dataItemOpts: {
                tags: [
                    { name: 'Content-Type', value: 'application/octet-stream' },
                    { name: 'App-Name', value: 'arxiv-archive' },
                    { name: 'Data-Type', value: 'parquet-index' },
                    { name: 'Version', value: '1.0.0' },
                    { name: 'Papers-Count', value: this.stats.papersUploaded.toString() },
                    { name: 'Deployment-Date', value: new Date().toISOString() }
                ]
            }
        });

        this.stats.parquetTxId = result.id;
        console.log(`✅ Parquet uploaded: ${result.id}\n`);
    }

    async step4_createHTMLViewer() {
        console.log('🌐 Step 4: Create HTML viewer with embedded Parquet TX ID');
        console.log('-' .repeat(40));

        // Read the template HTML
        let html = await fs.readFile(
            path.join(__dirname, 'arxiv-viewer.html'),
            'utf-8'
        );

        // Get paper count
        const statsResult = execSync('node dist/cli.js stats', {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf-8'
        });
        const totalMatch = statsResult.match(/Total papers: (\d+)/);
        const totalPapers = totalMatch ? totalMatch[1] : '0';

        // Replace placeholders with actual values
        html = html.replace(
            `const PARQUET_URL = null;`,
            `const PARQUET_URL = 'https://arweave.net/${this.stats.parquetTxId}';`
        );

        // Add auto-load script
        const autoLoadScript = `
        <script>
            // Auto-load the Parquet file on page load
            window.addEventListener('load', async () => {
                const PARQUET_TX_ID = '${this.stats.parquetTxId}';
                const DEPLOYMENT_DATE = '${new Date().toISOString()}';
                const TOTAL_PAPERS = '${totalPapers}';

                // Display deployment info
                console.log('ArXiv Archive deployed on:', DEPLOYMENT_DATE);
                console.log('Total papers:', TOTAL_PAPERS);
                console.log('Parquet TX ID:', PARQUET_TX_ID);

                // Auto-load Parquet after DuckDB initializes
                setTimeout(() => {
                    document.getElementById('arweaveUrl').value = PARQUET_TX_ID;
                    document.getElementById('loadArweave').click();
                }, 2000);
            });
        </script>
        `;

        // Insert before closing body tag
        html = html.replace('</body>', autoLoadScript + '\n</body>');

        // Save the customized HTML
        const outputPath = path.join(__dirname, 'arxiv-viewer-deployed.html');
        await fs.writeFile(outputPath, html);

        console.log('✅ HTML viewer created with embedded configuration\n');
        return outputPath;
    }

    async step5_uploadHTMLViewer(htmlPath) {
        console.log('📤 Step 5: Upload HTML viewer to Arweave');
        console.log('-' .repeat(40));

        const htmlContent = await fs.readFile(htmlPath);
        const sizeMB = (htmlContent.length / (1024 * 1024)).toFixed(2);

        console.log(`Uploading HTML viewer (${sizeMB} MB)...`);

        const result = await this.turbo.uploadFile({
            fileStreamFactory: () => htmlContent,
            fileSizeFactory: () => htmlContent.length,
            dataItemOpts: {
                tags: [
                    { name: 'Content-Type', value: 'text/html' },
                    { name: 'App-Name', value: 'arxiv-archive' },
                    { name: 'App-Version', value: '1.0.0' },
                    { name: 'Title', value: 'ArXiv Paper Archive' },
                    { name: 'Parquet-TX-ID', value: this.stats.parquetTxId },
                    { name: 'Papers-Uploaded', value: this.stats.papersUploaded.toString() },
                    { name: 'Deployment-Date', value: new Date().toISOString() }
                ]
            }
        });

        this.stats.htmlTxId = result.id;
        console.log(`✅ HTML viewer uploaded: ${result.id}\n`);
    }

    async createManifest() {
        console.log('📋 Creating deployment manifest');
        console.log('-' .repeat(40));

        const manifest = {
            deployment: {
                date: new Date().toISOString(),
                papersUploaded: this.stats.papersUploaded,
                parquetTxId: this.stats.parquetTxId,
                htmlTxId: this.stats.htmlTxId
            },
            urls: {
                viewer: `https://arweave.net/${this.stats.htmlTxId}`,
                parquet: `https://arweave.net/${this.stats.parquetTxId}`,
                alternative: {
                    viewer: `https://arweave.dev/${this.stats.htmlTxId}`,
                    parquet: `https://arweave.dev/${this.stats.parquetTxId}`
                }
            },
            instructions: [
                `1. Open the viewer: https://arweave.net/${this.stats.htmlTxId}`,
                `2. The Parquet data will auto-load`,
                `3. Search and browse your permanent ArXiv archive`,
                '',
                'Your archive is now permanent and will be accessible forever!'
            ]
        };

        // Save manifest locally
        const manifestPath = path.join(__dirname, `deployment-${Date.now()}.json`);
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

        // Also upload manifest to Arweave
        const manifestContent = Buffer.from(JSON.stringify(manifest, null, 2));
        const manifestResult = await this.turbo.uploadFile({
            fileStreamFactory: () => manifestContent,
            fileSizeFactory: () => manifestContent.length,
            dataItemOpts: {
                tags: [
                    { name: 'Content-Type', value: 'application/json' },
                    { name: 'App-Name', value: 'arxiv-archive' },
                    { name: 'Data-Type', value: 'deployment-manifest' }
                ]
            }
        });

        console.log(`✅ Manifest saved locally and uploaded: ${manifestResult.id}\n`);
        return manifest;
    }

    async deploy() {
        try {
            await this.initialize();

            // Execute deployment steps
            await this.step1_uploadNewPapers();
            await this.step2_updateParquetIndex();
            await this.step3_uploadParquet();
            const htmlPath = await this.step4_createHTMLViewer();
            await this.step5_uploadHTMLViewer(htmlPath);

            // Create and display manifest
            const manifest = await this.createManifest();

            // Success message
            console.log('=' .repeat(60));
            console.log('🎉 DEPLOYMENT COMPLETE!');
            console.log('=' .repeat(60) + '\n');

            console.log('📊 Summary:');
            console.log(`   Papers uploaded: ${this.stats.papersUploaded}`);
            console.log(`   Parquet TX ID: ${this.stats.parquetTxId}`);
            console.log(`   HTML TX ID: ${this.stats.htmlTxId}\n`);

            console.log('🌐 Your permanent ArXiv archive:');
            console.log(`   ${manifest.urls.viewer}\n`);

            console.log('✨ This archive will be accessible forever on Arweave!');

        } catch (error) {
            console.error('\n❌ Deployment failed:', error);
            process.exit(1);
        }
    }
}

// Run deployment
const deployer = new SmartDeployer();
deployer.deploy();