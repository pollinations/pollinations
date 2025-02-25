import { performWebSearch } from './tools/searchTool.js';
import debug from 'debug';

// Enable debug logging
debug.enable('pollinations:search');

async function runMultipleSearches() {
  console.log('Running multiple searches to test API key rotation...');
  
  // First search
  console.log('\nSearch 1:');
  await performWebSearch({ query: 'artificial intelligence', num_results: 3 });
  
  // Second search
  console.log('\nSearch 2:');
  await performWebSearch({ query: 'machine learning', num_results: 3 });
  
  // Third search
  console.log('\nSearch 3:');
  await performWebSearch({ query: 'neural networks', num_results: 3 });
  
  console.log('\nTest completed.');
}

runMultipleSearches().catch(console.error);