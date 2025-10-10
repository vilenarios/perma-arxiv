#!/usr/bin/env node

import { Command } from 'commander';
import { ArxivScraper } from './scraper';
import { CATEGORIES } from './config';
import logger from './utils/logger';

const program = new Command();

program
  .name('arxiv-scraper')
  .description('Robust ArXiv paper scraper with incremental sync capabilities')
  .version('1.0.0');

program
  .command('scrape')
  .description('Scrape papers from ArXiv')
  .option('-c, --categories <categories...>', 'Categories to scrape', CATEGORIES)
  .option('-s, --start-date <date>', 'Start date (YYYY-MM-DD)')
  .option('-e, --end-date <date>', 'End date (YYYY-MM-DD)')
  .option('-m, --max-papers <number>', 'Maximum papers to scrape', parseInt)
  .option('--no-download', 'Skip PDF downloads')
  .option('--incremental', 'Only fetch new papers since last sync')
  .action(async (options) => {
    const scraper = new ArxivScraper();

    try {
      await scraper.initialize();

      const scraperOptions = {
        categories: options.categories,
        startDate: options.startDate,
        endDate: options.endDate,
        maxPapers: options.maxPapers,
        downloadPdfs: options.download,
        incrementalOnly: options.incremental
      };

      if (options.incremental) {
        await scraper.incrementalSync(scraperOptions);
      } else {
        await scraper.scrapeAll(scraperOptions);
      }

      await scraper.close();
    } catch (error) {
      logger.error('Scraping failed', { error });
      process.exit(1);
    }
  });

program
  .command('download')
  .description('Download missing PDFs')
  .option('-l, --limit <number>', 'Maximum PDFs to download', (val) => parseInt(val, 10), 100)
  .action(async (options) => {
    const scraper = new ArxivScraper();

    try {
      await scraper.initialize();
      const limit = options.limit || 100;
      logger.info(`Download limit set to: ${limit}`);
      await scraper.downloadMissingPdfs(limit);
      await scraper.close();
    } catch (error) {
      logger.error('Download failed', { error });
      process.exit(1);
    }
  });

program
  .command('search')
  .description('Search for papers')
  .argument('<query>', 'Search query')
  .option('-l, --limit <number>', 'Maximum results', parseInt, 10)
  .option('-d, --download', 'Download PDFs of results')
  .action(async (query, options) => {
    const scraper = new ArxivScraper();

    try {
      await scraper.initialize();
      const papers = await scraper.searchPapers(query, options.limit);

      console.log(`\nFound ${papers.length} papers:\n`);
      for (const paper of papers) {
        console.log(`ID: ${paper.id}`);
        console.log(`Title: ${paper.title}`);
        console.log(`Authors: ${paper.authors.join(', ')}`);
        console.log(`Categories: ${paper.categories.join(', ')}`);
        console.log(`Updated: ${paper.updated}`);
        console.log('---');
      }

      if (options.download) {
        const { PdfDownloader } = await import('./downloader');
        const { Database } = await import('./database');

        const downloader = new PdfDownloader();
        const db = new Database();

        await db.initialize();
        const results = await downloader.downloadBatch(papers);

        for (const [paperId, result] of results) {
          if (result.success && result.path) {
            await db.markAsDownloaded(paperId, result.path, result.format || 'pdf');
            console.log(`Downloaded (${result.format}): ${paperId}`);
          } else {
            console.error(`Failed to download ${paperId}: ${result.error}`);
          }
        }

        await db.close();
      }

      await scraper.close();
    } catch (error) {
      logger.error('Search failed', { error });
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show database and download statistics')
  .action(async () => {
    const scraper = new ArxivScraper();

    try {
      await scraper.initialize();
      const stats = await scraper.getStatistics();

      console.log('\n=== ArXiv Scraper Statistics ===\n');
      console.log('Database:');
      console.log(`  Total papers: ${stats.database.total_papers}`);
      console.log(`  Downloaded: ${stats.database.downloaded_papers}`);
      console.log(`  Failed: ${stats.database.failed_papers}`);
      console.log('\nDownloads:');
      console.log(`  Total files: ${stats.downloads.totalFiles}`);
      console.log(`  Total size: ${stats.downloads.totalSizeGB} GB`);

      await scraper.close();
    } catch (error) {
      logger.error('Failed to get statistics', { error });
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Perform incremental sync for all categories')
  .option('--no-download', 'Skip PDF downloads')
  .action(async (options) => {
    const scraper = new ArxivScraper();

    try {
      await scraper.initialize();

      console.log('Starting incremental sync...');
      await scraper.incrementalSync({
        downloadPdfs: options.download
      });

      const stats = await scraper.getStatistics();
      console.log('\nSync completed!');
      console.log(`Total papers: ${stats.database.total_papers}`);
      console.log(`Downloaded PDFs: ${stats.database.downloaded_papers}`);

      await scraper.close();
    } catch (error) {
      logger.error('Sync failed', { error });
      process.exit(1);
    }
  });

program
  .command('scrape-quality')
  .description('Scrape only high-quality, peer-reviewed papers')
  .option('-c, --categories <categories...>', 'Categories to scrape', ['cs.LG', 'cs.AI'])
  .option('-d, --days <number>', 'Days back to search', parseInt, 30)
  .option('-n, --number <number>', 'Number of papers to collect', parseInt, 100)
  .option('--no-download', 'Skip PDF downloads')
  .option('--peer-reviewed', 'Only peer-reviewed papers', true)
  .option('--weekly', 'Get top papers from last week')
  .action(async (options) => {
    const { SmartScraper } = await import('./scraper/smartScraper');
    const scraper = new SmartScraper();

    try {
      await scraper.initialize();

      let papers;
      if (options.weekly) {
        console.log('Scraping top papers from last week...');
        papers = await scraper.scrapeWeeklyTop(options.categories, 10);
      } else if (options.peerReviewed) {
        console.log('Scraping peer-reviewed papers...');
        papers = await scraper.scrapePeerReviewed({
          categories: options.categories,
          daysBack: options.days,
          sampleSize: options.number,
          onlyPeerReviewed: true,
          downloadPdfs: options.download
        });
      } else {
        console.log('Scraping high-quality papers...');
        papers = await scraper.scrapeHighQuality({
          categories: options.categories,
          daysBack: options.days,
          sampleSize: options.number,
          downloadPdfs: options.download
        });
      }

      console.log(`\nScraped ${papers.length} high-quality papers:`);

      const peerReviewedCount = papers.filter(p => p.journalRef).length;
      const multiVersionCount = papers.filter(p => p.version > 1).length;

      console.log(`  - Peer-reviewed: ${peerReviewedCount}`);
      console.log(`  - Multiple versions: ${multiVersionCount}`);
      console.log(`  - Categories: ${options.categories.join(', ')}`);

      await scraper.close();
    } catch (error) {
      logger.error('Quality scraping failed', { error });
      process.exit(1);
    }
  });

program
  .command('categories')
  .description('List available ArXiv categories')
  .action(() => {
    console.log('\nAvailable ArXiv Categories:\n');
    CATEGORIES.forEach(cat => {
      console.log(`  - ${cat}`);
    });
  });

program
  .command('scrape-important')
  .description('Scrape only the most important papers using smart filtering (defaults to ALL categories, 1 year)')
  .option('-c, --categories <categories...>', 'Categories to scrape (default: all 155+ categories)')
  .option('-d, --days <number>', 'Days back to search (default: 365)', parseInt)
  .option('-s, --min-score <number>', 'Minimum importance score (default: 10)', parseInt)
  .option('-n, --number <number>', 'Maximum papers to collect (default: 100000)', parseInt)
  .option('--no-download', 'Skip PDF downloads')
  .option('-t, --type <type>', 'Filter type: all, conference, journal, survey, with-code', 'all')
  .option('--weekly', 'Get top papers from this week')
  .option('--hidden-gems', 'Find papers with code implementations')
  .option('--analyze', 'Analyze existing database for important papers')
  .action(async (options) => {
    const { ImportantPapersScraper } = await import('./scraper/importantPapersScraper');
    const scraper = new ImportantPapersScraper();

    try {
      await scraper.initialize();

      if (options.analyze) {
        await scraper.analyzeExistingDatabase();
      } else if (options.weekly) {
        console.log('Scraping top papers from this week...');
        const papers = await scraper.scrapeTopPapersThisWeek(options.categories);
        console.log(`Found ${papers.length} important papers from this week`);
      } else if (options.hiddenGems) {
        console.log('Finding hidden gems with code...');
        const papers = await scraper.findHiddenGems(options.categories);
        console.log(`Found ${papers.length} papers with code implementations`);
      } else {
        console.log(`Scraping important papers (min score: ${options.minScore})...`);
        const papers = await scraper.scrapeImportantPapers({
          categories: options.categories,
          daysBack: options.days,
          minScore: options.minScore,
          maxPapers: options.number,
          downloadPdfs: options.download,
          filterType: options.type
        });

        console.log(`\nScraped ${papers.length} important papers`);

        // Show summary
        const { SmartFilter } = await import('./importance/smartFilter');
        const filter = new SmartFilter();

        const conference = papers.filter(p => filter['isConferencePaper'](p)).length;
        const journal = papers.filter(p => filter['hasJournalPublication'](p)).length;
        const withCode = papers.filter(p => filter['hasCodeRepository'](p)).length;

        console.log(`  Conference papers: ${conference}`);
        console.log(`  Journal papers: ${journal}`);
        console.log(`  Papers with code: ${withCode}`);
      }

      await scraper.close();
    } catch (error) {
      logger.error('Important papers scraping failed', { error });
      process.exit(1);
    }
  });

program
  .command('index:export')
  .description('Export database to Parquet format')
  .option('-b, --batch-size <number>', 'Batch size for export', parseInt, 10000)
  .option('-p, --partitioned', 'Create partitioned export by category')
  .action(async (options) => {
    const { ParquetExporter } = await import('./index/parquetExporter');
    const exporter = new ParquetExporter();

    try {
      await exporter.initialize();

      if (options.partitioned) {
        console.log('Creating partitioned Parquet export...');
        await exporter.createPartitionedExport();
      } else {
        console.log('Exporting to Parquet format...');
        const files = await exporter.exportToParquet(options.batchSize);
        console.log(`\nExport completed! Created ${files.length} Parquet files`);
      }

      await exporter.close();
    } catch (error) {
      logger.error('Export failed', { error });
      process.exit(1);
    }
  });

program
  .command('index:query')
  .description('Query papers from Parquet index')
  .option('-c, --category <category>', 'Filter by category')
  .option('-a, --author <author>', 'Filter by author')
  .option('-s, --search <text>', 'Search in title and summary')
  .option('-l, --limit <number>', 'Maximum results', parseInt, 10)
  .option('--start-date <date>', 'Start date (YYYY-MM-DD)')
  .option('--end-date <date>', 'End date (YYYY-MM-DD)')
  .action(async (options) => {
    const { DuckDBQuery } = await import('./index/duckdbQuery');
    const query = new DuckDBQuery();

    try {
      await query.initialize();

      const queryOptions: any = {
        limit: options.limit
      };

      if (options.category) {
        queryOptions.categories = [options.category];
      }

      if (options.author) {
        queryOptions.authors = [options.author];
      }

      if (options.search) {
        queryOptions.searchText = options.search;
      }

      if (options.startDate || options.endDate) {
        queryOptions.dateRange = {};
        if (options.startDate) {
          queryOptions.dateRange.start = new Date(options.startDate);
        }
        if (options.endDate) {
          queryOptions.dateRange.end = new Date(options.endDate);
        }
      }

      const results = await query.query(queryOptions);

      console.log(`\nFound ${results.length} papers:\n`);
      for (const paper of results) {
        console.log(`ID: ${paper.id}`);
        console.log(`Title: ${paper.title}`);
        console.log(`Authors: ${paper.authors}`);
        console.log(`Categories: ${paper.all_categories}`);
        console.log(`Published: ${paper.published.toISOString().split('T')[0]}`);
        if (paper.downloaded) {
          console.log(`Downloaded: ✓`);
        }
        console.log('---');
      }

      query.close();
    } catch (error) {
      logger.error('Query failed', { error });
      process.exit(1);
    }
  });

program
  .command('index:stats')
  .description('Show index statistics')
  .action(async () => {
    const { DuckDBQuery } = await import('./index/duckdbQuery');
    const query = new DuckDBQuery();

    try {
      await query.initialize();
      const stats = await query.getStatistics();

      console.log('\n=== Parquet Index Statistics ===\n');

      console.log('Papers by Category:');
      const topCategories = Array.from(stats.papersByCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      topCategories.forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });

      console.log('\nPapers by Year:');
      const recentYears = Array.from(stats.papersByYear.entries())
        .sort((a, b) => b[0] - a[0])
        .slice(0, 5);
      recentYears.forEach(([year, count]) => {
        console.log(`  ${year}: ${count}`);
      });

      console.log('\nTop Authors:');
      stats.topAuthors.slice(0, 10).forEach(author => {
        console.log(`  ${author.name}: ${author.count} papers`);
      });

      console.log('\nDownload Statistics:');
      console.log(`  Downloaded papers: ${stats.downloadedCount}`);
      console.log(`  Total size: ${stats.totalSizeGb.toFixed(2)} GB`);
      console.log(`  Average paper size: ${stats.avgPaperSizeMb.toFixed(2)} MB`);

      query.close();
    } catch (error) {
      logger.error('Failed to get statistics', { error });
      process.exit(1);
    }
  });

program
  .command('index:similar')
  .description('Find similar papers')
  .argument('<paper-id>', 'Paper ID to find similar papers for')
  .option('-l, --limit <number>', 'Maximum results', parseInt, 10)
  .action(async (paperId, options) => {
    const { DuckDBQuery } = await import('./index/duckdbQuery');
    const query = new DuckDBQuery();

    try {
      await query.initialize();
      const results = await query.findSimilarPapers(paperId, options.limit);

      console.log(`\nFound ${results.length} similar papers:\n`);
      for (const paper of results) {
        console.log(`ID: ${paper.id}`);
        console.log(`Title: ${paper.title}`);
        console.log(`Categories: ${paper.all_categories}`);
        console.log(`Published: ${paper.published.toISOString().split('T')[0]}`);
        console.log('---');
      }

      query.close();
    } catch (error) {
      logger.error('Query failed', { error });
      process.exit(1);
    }
  });

// Upload commands
program
  .command('upload:batch')
  .description('Upload downloaded papers to Arweave in batches')
  .option('-b, --batch-size <number>', 'Number of papers per batch', parseInt, 10)
  .option('-d, --delay <number>', 'Delay between batches in ms', parseInt, 5000)
  .option('--dry-run', 'Simulate upload without actually uploading')
  .option('-w, --wallet <path>', 'Path to Arweave wallet JWK file', process.env.ARWEAVE_WALLET_PATH || './wallet.json')
  .action(async (options) => {
    const { BatchProcessor } = await import('./arweave/batchProcessor');
    const processor = new BatchProcessor(options.wallet);

    try {
      await processor.initialize();

      await processor.processBatch({
        batchSize: options.batchSize,
        delayBetweenBatches: options.delay,
        dryRun: options.dryRun
      });

      await processor.close();
    } catch (error) {
      logger.error('Upload batch failed', { error });
      process.exit(1);
    }
  });

program
  .command('upload:all')
  .description('Upload all downloaded papers to Arweave')
  .option('-b, --batch-size <number>', 'Number of papers per batch', parseInt, 10)
  .option('-d, --delay <number>', 'Delay between batches in ms', parseInt, 5000)
  .option('--dry-run', 'Simulate upload without actually uploading')
  .option('-w, --wallet <path>', 'Path to Arweave wallet JWK file', process.env.ARWEAVE_WALLET_PATH || './wallet.json')
  .action(async (options) => {
    const { BatchProcessor } = await import('./arweave/batchProcessor');
    const processor = new BatchProcessor(options.wallet);

    try {
      await processor.initialize();

      await processor.processAll({
        batchSize: options.batchSize,
        delayBetweenBatches: options.delay,
        dryRun: options.dryRun
      });

      await processor.close();
    } catch (error) {
      logger.error('Upload process failed', { error });
      process.exit(1);
    }
  });

program
  .command('upload:status')
  .description('Check upload status and statistics')
  .option('-w, --wallet <path>', 'Path to Arweave wallet JWK file', process.env.ARWEAVE_WALLET_PATH || './wallet.json')
  .action(async (options) => {
    const { BatchProcessor } = await import('./arweave/batchProcessor');
    const processor = new BatchProcessor(options.wallet);

    try {
      await processor.initialize();
      const status = await processor.getUploadStatus();

      console.log('\n=== Upload Status ===\n');
      console.log('Database Statistics:');
      console.log(`  Total downloaded: ${status.database.total_downloaded}`);
      console.log(`  Uploaded: ${status.database.uploaded}`);
      console.log(`  Pending: ${status.database.pending_upload}`);
      console.log(`  Failed: ${status.database.failed_upload}`);

      // Parquet statistics are shown from database (source of truth)
      // Parquet files are read-only exports

      console.log('\nWallet Balance:');
      console.log(`  ${status.balance.winc} winc`);
      console.log(`  ${status.balance.ar} AR`);

      await processor.close();
    } catch (error) {
      logger.error('Failed to get upload status', { error });
      process.exit(1);
    }
  });

program
  .command('upload:verify')
  .description('Verify uploaded papers on Arweave')
  .option('-w, --wallet <path>', 'Path to Arweave wallet JWK file', process.env.ARWEAVE_WALLET_PATH || './wallet.json')
  .action(async (options) => {
    const { BatchProcessor } = await import('./arweave/batchProcessor');
    const processor = new BatchProcessor(options.wallet);

    try {
      await processor.initialize();
      await processor.verifyUploads();
      await processor.close();
    } catch (error) {
      logger.error('Verification failed', { error });
      process.exit(1);
    }
  });

program
  .command('upload:cost')
  .description('Estimate upload costs')
  .option('-s, --size-mb <number>', 'File size in MB to estimate', parseFloat, 1)
  .option('-w, --wallet <path>', 'Path to Arweave wallet JWK file', process.env.ARWEAVE_WALLET_PATH || './wallet.json')
  .action(async (options) => {
    const { TurboUploader } = await import('./arweave/turboUploader');
    const uploader = new TurboUploader(options.wallet);

    try {
      await uploader.initialize();

      const sizeInBytes = options.sizeMb * 1024 * 1024;
      const cost = await uploader.getUploadCost(sizeInBytes);

      console.log(`\nUpload cost for ${options.sizeMb} MB:`);
      console.log(`  ${cost.winc} winc`);
      console.log(`  ${cost.ar} AR`);

      const balance = await uploader.checkBalance();
      console.log(`\nCurrent balance:`);
      console.log(`  ${balance.winc} winc`);
      console.log(`  ${balance.ar} AR`);

      // Calculate how many files of this size can be uploaded
      const filesCanUpload = Number(BigInt(balance.winc) / BigInt(cost.winc));
      console.log(`\nYou can upload approximately ${filesCanUpload} files of this size`);

    } catch (error) {
      logger.error('Cost estimation failed', { error });
      process.exit(1);
    }
  });

// Health check command
program
  .command('health')
  .description('Run system health checks')
  .action(async () => {
    const { runHealthCheck } = await import('./utils/healthCheck');
    await runHealthCheck();
  });

// Startup validation command
program
  .command('validate')
  .description('Run startup validation checks')
  .action(async () => {
    const { StartupValidator } = await import('./utils/startup');
    const validator = new StartupValidator();

    try {
      const results = await validator.validateAll();
      console.log('\n✅ All startup validations passed\n');
      console.log('Results:', JSON.stringify(results, null, 2));
      process.exit(0);
    } catch (error: any) {
      console.error('\n❌ Startup validation failed\n');
      console.error(error.message);
      process.exit(1);
    }
  });

// ArNS commands
program
  .command('arns:update-site')
  .description('Update arxiv ArNS name to point to new deployment')
  .argument('<transaction-id>', 'Arweave transaction ID of the deployed site')
  .option('-w, --wallet <path>', 'Path to Arweave wallet', process.env.ARWEAVE_WALLET_PATH || './wallet.json')
  .action(async (transactionId, options) => {
    const { ArnsManager } = await import('./arweave/arnsManager');
    const manager = new ArnsManager(options.wallet);

    try {
      console.log(`\n🔄 Updating arxiv ArNS name to point to ${transactionId}...`);
      const result = await manager.updateMainSite(transactionId);

      if (result.success) {
        console.log('✅ ArNS record updated successfully!');
        console.log(`Message ID: ${result.messageId}`);
        console.log(`\n🌐 Your site is now accessible at: https://arxiv.arweave.net\n`);
      } else {
        console.error('❌ Failed to update ArNS record:', result.error);
        process.exit(1);
      }
    } catch (error) {
      logger.error('ArNS update failed', { error });
      process.exit(1);
    }
  });

program
  .command('arns:update-data')
  .description('Update data_arxiv ArNS name to point to new parquet file')
  .argument('<transaction-id>', 'Arweave transaction ID of the parquet file')
  .option('-u, --undername <name>', 'Undername to update (default: @)', '@')
  .option('-w, --wallet <path>', 'Path to Arweave wallet', process.env.ARWEAVE_WALLET_PATH || './wallet.json')
  .action(async (transactionId, options) => {
    const { ArnsManager } = await import('./arweave/arnsManager');
    const manager = new ArnsManager(options.wallet);

    try {
      console.log(`\n🔄 Updating data_arxiv ArNS ${options.undername} to point to ${transactionId}...`);
      const result = await manager.updateDataIndex(transactionId, options.undername);

      if (result.success) {
        console.log('✅ ArNS data record updated successfully!');
        console.log(`Message ID: ${result.messageId}`);
        console.log(`\n🌐 Data is now accessible at: https://data_arxiv.arweave.net\n`);
      } else {
        console.error('❌ Failed to update ArNS record:', result.error);
        process.exit(1);
      }
    } catch (error) {
      logger.error('ArNS data update failed', { error });
      process.exit(1);
    }
  });

program
  .command('arns:status')
  .description('Show current ArNS configuration and state')
  .option('-w, --wallet <path>', 'Path to Arweave wallet', process.env.ARWEAVE_WALLET_PATH || './wallet.json')
  .action(async (options) => {
    const { ArnsManager } = await import('./arweave/arnsManager');
    const { ARNS_NAME_MAIN, ARNS_NAME_DATA, ANT_PROCESS_ID_MAIN, ANT_PROCESS_ID_DATA } = await import('./config');

    try {
      console.log('\n=== ArNS Configuration ===\n');
      console.log(`Main site name: ${ARNS_NAME_MAIN}`);
      console.log(`Data name: ${ARNS_NAME_DATA}`);
      console.log(`ANT Process ID (main): ${ANT_PROCESS_ID_MAIN || '⚠️  NOT SET'}`);
      console.log(`ANT Process ID (data): ${ANT_PROCESS_ID_DATA || '⚠️  NOT SET'}`);

      const manager = new ArnsManager(options.wallet);

      if (ANT_PROCESS_ID_MAIN) {
        console.log('\n=== Main Site Records ===');
        const mainState = await manager.getMainSiteState();
        console.log(JSON.stringify(mainState.Records || {}, null, 2));
      }

      if (ANT_PROCESS_ID_DATA) {
        console.log('\n=== Data Index Records ===');
        const dataState = await manager.getDataIndexState();
        console.log(JSON.stringify(dataState.Records || {}, null, 2));
      }

      console.log('');
    } catch (error) {
      logger.error('Failed to get ArNS status', { error });
      process.exit(1);
    }
  });

program
  .command('arns:test')
  .description('Test ArNS configuration and connectivity')
  .option('-w, --wallet <path>', 'Path to Arweave wallet', process.env.ARWEAVE_WALLET_PATH || './wallet.json')
  .action(async (options) => {
    const { ArnsManager } = await import('./arweave/arnsManager');
    const { ANT_PROCESS_ID_MAIN, ANT_PROCESS_ID_DATA } = await import('./config');

    console.log('\n🧪 Testing ArNS configuration...\n');

    try {
      // Test 1: Check environment variables
      console.log('1. Checking environment variables...');
      if (!ANT_PROCESS_ID_MAIN) console.warn('   ⚠️  ANT_PROCESS_ID_MAIN not set');
      else console.log('   ✅ ANT_PROCESS_ID_MAIN configured');

      if (!ANT_PROCESS_ID_DATA) console.warn('   ⚠️  ANT_PROCESS_ID_DATA not set');
      else console.log('   ✅ ANT_PROCESS_ID_DATA configured');

      // Test 2: Initialize ArnsManager
      console.log('\n2. Initializing ArnsManager...');
      const manager = new ArnsManager(options.wallet);
      console.log('   ✅ ArnsManager initialized');

      // Test 3: Verify configuration
      console.log('\n3. Verifying ANT accessibility...');
      const verification = await manager.verifyConfiguration();

      if (verification.valid) {
        console.log('   ✅ All ANTs accessible');
      } else {
        console.log('   ❌ Configuration errors:');
        verification.errors.forEach(err => console.log(`      - ${err}`));
      }

      console.log('\n' + (verification.valid ? '🎉 All tests passed!' : '❌ Some tests failed'));
      process.exit(verification.valid ? 0 : 1);
    } catch (error: any) {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('index:export-upload')
  .description('Export database to Parquet, upload to Arweave, and update ArNS')
  .option('-b, --batch-size <number>', 'Batch size for export', parseInt, 10000)
  .option('--no-upload', 'Skip Arweave upload')
  .option('--no-arns', 'Skip ArNS update')
  .option('-w, --wallet <path>', 'Path to Arweave wallet', process.env.ARWEAVE_WALLET_PATH || './wallet.json')
  .action(async (options) => {
    const { ParquetExporter } = await import('./index/parquetExporter');
    const exporter = new ParquetExporter();

    try {
      await exporter.initialize();

      console.log('\n📦 Exporting database to Parquet format...');

      const result = await exporter.exportAndUpload(
        options.upload,
        options.arns,
        options.wallet
      );

      console.log(`\n✅ Export completed! Created ${result.files.length} Parquet file(s)`);

      if (result.transactionId) {
        console.log(`\n📤 Uploaded to Arweave: ${result.transactionId}`);
        console.log(`🌐 Data accessible at: https://data_arxiv.arweave.net\n`);
      }

      await exporter.close();
    } catch (error) {
      logger.error('Export and upload failed', { error });
      process.exit(1);
    }
  });

program
  .command('web:deploy')
  .description('Deploy web viewer to Arweave and update arxiv ArNS')
  .argument('<html-file>', 'Path to HTML file to deploy')
  .option('-w, --wallet <path>', 'Path to Arweave wallet', process.env.ARWEAVE_WALLET_PATH || './wallet.json')
  .action(async (htmlFile: string, options) => {
    try {
      const { TurboUploader } = await import('./arweave/turboUploader');
      const { ArnsManager } = await import('./arweave/arnsManager');
      const path = await import('path');

      console.log('\n🚀 Deploying web viewer to Arweave...\n');

      // Initialize uploader
      const uploader = new TurboUploader(options.wallet);
      await uploader.initialize();

      // Read and upload HTML file
      const htmlPath = path.resolve(htmlFile);
      logger.info('Uploading web viewer', { file: htmlPath });

      const uploadResult = await uploader.uploadPaper(
        htmlPath,
        'web-viewer',
        {
          title: 'Permanent arXiv Web Viewer',
          authors: 'PermaArxiv',
          categories: 'web',
          published: new Date().toISOString()
        }
      );

      if (!uploadResult || !uploadResult.id) {
        throw new Error('Upload failed - no transaction ID returned');
      }

      console.log(`✅ Web viewer uploaded: ${uploadResult.id}`);
      console.log(`   https://arweave.net/${uploadResult.id}\n`);

      // Update ArNS
      console.log('🔄 Updating arxiv ArNS record...\n');
      const arnsManager = new ArnsManager(options.wallet);
      const result = await arnsManager.updateMainSite(uploadResult.id);

      if (result.success) {
        console.log('✅ ArNS record updated successfully!');
        console.log(`   Message ID: ${result.messageId}\n`);
        console.log('🌐 Your site is now accessible at:');
        console.log('   https://arxiv.ar.io');
        console.log('   https://arxiv.arweave.net');
      } else {
        throw new Error(`ArNS update failed: ${result.error}`);
      }
    } catch (error: any) {
      console.error('\n❌ Deployment failed:', error.message);
      logger.error('Web deployment failed', { error });
      process.exit(1);
    }
  });

program.parse(process.argv);