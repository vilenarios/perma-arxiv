const { ArxivClient } = require('./dist/api/arxivClient');

async function test() {
  const client = new ArxivClient();

  const result = await client.search({
    searchQuery: 'cat:cs.AI',
    maxResults: 2
  });

  console.log('=== FULL PAPER DATA ===');
  result.papers.forEach(paper => {
    console.log(JSON.stringify(paper, null, 2));
    console.log('---');
  });
}

test();