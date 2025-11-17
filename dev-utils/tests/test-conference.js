const { ArxivClient } = require('./dist/api/arxivClient');

async function test() {
  const client = new ArxivClient();

  // Search for papers that might have conference info
  const queries = [
    'all:"accepted NeurIPS"',
    'all:"ICML 2024"',
    'all:"to appear"',
    'all:"github.com"'
  ];

  for (const query of queries) {
    console.log(`\n=== Searching: ${query} ===`);

    const result = await client.search({
      searchQuery: query,
      maxResults: 2
    });

    result.papers.forEach(paper => {
      console.log(`Title: ${paper.title.substring(0, 80)}`);
      console.log(`Comment: ${paper.comment || 'None'}`);
      console.log(`Journal: ${paper.journalRef || 'None'}`);
      console.log(`Version: v${paper.version}`);
      console.log('---');
    });

    await new Promise(r => setTimeout(r, 1000));
  }
}

test();