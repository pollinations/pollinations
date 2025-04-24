#!/usr/bin/env node

import { listImageModels } from './src/index.js';

async function main() {
  console.log('Starting simple test of MCP server');
  
  try {
    // Call the listImageModels function directly
    console.log('Calling listImageModels function...');
    const result = await listImageModels();
    console.log('Got result from listImageModels function:', JSON.stringify(result, null, 2));
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Error in test:', error);
  }
}

main();
