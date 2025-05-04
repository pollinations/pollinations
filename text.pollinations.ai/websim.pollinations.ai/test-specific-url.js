// Script to test a specific URL
import fetch from 'node-fetch';

const url = 'https://websim.pollinations.ai/simple%20calculator/';

async function testUrl() {
  console.log(`Testing URL: ${url}`);

  try {
    console.log('Making request...');
    const startTime = Date.now();
    const response = await fetch(url);
    const endTime = Date.now();

    console.log(`\nResponse received in ${endTime - startTime}ms`);
    console.log('Response status:', response.status);

    // Log all headers for debugging
    console.log('\nAll response headers:');
    response.headers.forEach((value, name) => {
      console.log(`${name}: ${value}`);
    });

    // Get the response body as text
    console.log('\nGetting response body...');
    const startBodyTime = Date.now();
    const text = await response.text();
    const endBodyTime = Date.now();

    console.log(`Response body received in ${endBodyTime - startBodyTime}ms`);
    console.log(`Total response size: ${text.length} bytes`);

    // Show the beginning of the response
    console.log('\nResponse body (first 500 chars):');
    console.log(text.substring(0, 500));

    // Show some sections from the middle of the response
    if (text.length > 1000) {
      console.log('\nMiddle section (500 chars from position 1000):');
      console.log(text.substring(1000, 1500));
    }

    // Show the end of the response
    if (text.length > 500) {
      console.log('\nEnd section (last 500 chars):');
      console.log(text.substring(text.length - 500));
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testUrl();
