// Simple test script for the redirect function
require('dotenv').config({ path: './.env.production' });
const redirectFunction = require('./functions/redirect');

// Mock event objects for testing
const testEvents = [
  {
    // Test lovemy redirect
    path: '/redirect/lovemy',
    httpMethod: 'GET',
    headers: {
      'user-agent': 'Test User Agent',
      'referer': 'https://test-referrer.com'
    },
    queryStringParameters: {}
  },
  {
    // Test hentai redirect
    path: '/redirect/hentai',
    httpMethod: 'GET',
    headers: {
      'user-agent': 'Test User Agent',
      'referer': 'https://test-referrer.com'
    },
    queryStringParameters: {}
  },
  {
    // Test custom URL redirect
    path: '/redirect/custom',
    httpMethod: 'GET',
    headers: {
      'user-agent': 'Test User Agent',
      'referer': 'https://test-referrer.com'
    },
    queryStringParameters: {
      url: 'https://example.com'
    }
  }
];

// Run tests sequentially
async function runTests() {
  console.log('Starting redirect function tests...');
  console.log('Environment variables:');
  console.log('- GA_MEASUREMENT_ID:', process.env.GA_MEASUREMENT_ID ? 'Set' : 'Not set');
  console.log('- GA_API_SECRET:', process.env.GA_API_SECRET ? 'Set' : 'Not set');
  console.log('-----------------------------------');

  for (const [index, event] of testEvents.entries()) {
    console.log(`\nTest #${index + 1}: ${event.path}`);
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
      const response = await redirectFunction.handler(event, {});
      console.log('Response:', JSON.stringify(response, null, 2));
      console.log(`Test #${index + 1} completed successfully`);
    } catch (error) {
      console.error(`Test #${index + 1} failed:`, error);
    }
    
    console.log('-----------------------------------');
  }
  
  console.log('\nAll tests completed');
}

// Run the tests
runTests();
