const { ArxivClient } = require('./dist/api/arxivClient');

async function test() {
  console.log('Testing ArXiv API...');
  const client = new ArxivClient();

  try {
    const result = await client.search({
      searchQuery: 'cat:cs.AI',
      maxResults: 5
    });

    console.log(`Found ${result.papers.length} papers:`);
    result.papers.forEach(paper => {
      console.log(`- ${paper.title}`);
      console.log(`  Authors: ${paper.authors.join(', ')}`);
      console.log(`  Published: ${paper.published}`);
      console.log(`  Has journal ref: ${!!paper.journalRef}`);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

test();