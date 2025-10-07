#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');

async function cleanCorruptedPDFs() {
    console.log('🔍 Scanning for corrupted PDFs...\n');

    const db = new sqlite3.Database('./arxiv.db');

    const papers = await new Promise((resolve, reject) => {
        db.all(
            `SELECT id, download_path FROM papers WHERE downloaded = 1 AND download_path IS NOT NULL`,
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });

    console.log(`Found ${papers.length} papers marked as downloaded\n`);

    let corruptedCount = 0;
    let validCount = 0;

    for (const paper of papers) {
        try {
            const fullPath = path.join(__dirname, paper.download_path);
            const fileBuffer = await fs.readFile(fullPath);

            // Check if file is a valid PDF (starts with %PDF)
            const isPdf = fileBuffer.length > 100 &&
                         fileBuffer[0] === 0x25 &&
                         fileBuffer[1] === 0x50 &&
                         fileBuffer[2] === 0x44 &&
                         fileBuffer[3] === 0x46;

            if (!isPdf) {
                console.log(`❌ Corrupted: ${paper.id} (${fileBuffer.length} bytes)`);

                // Delete the corrupted file
                await fs.unlink(fullPath);

                // Update database to mark as not downloaded
                await new Promise((resolve, reject) => {
                    db.run(
                        `UPDATE papers SET downloaded = 0, download_path = NULL, download_date = NULL, transaction_id = NULL WHERE id = ?`,
                        [paper.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                corruptedCount++;
            } else {
                validCount++;
            }
        } catch (error) {
            console.log(`⚠️  Error checking ${paper.id}: ${error.message}`);
        }
    }

    db.close();

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Valid PDFs: ${validCount}`);
    console.log(`   Corrupted PDFs removed: ${corruptedCount}`);
    console.log(`\nYou can now re-download the corrupted PDFs with:`);
    console.log(`   node dist/cli.js scrape --incremental\n`);
}

cleanCorruptedPDFs().catch(console.error);
