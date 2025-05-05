// Simple streaming cache test
import fetch from 'node-fetch';

async function testStreamingCache() {
  console.log('Testing streaming cache with simple prompt...');

  // First request - should be a cache miss
  console.log('\n--- First request (should be MISS) ---');
  const response1 = await fetch('https://text.pollinations.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'max-age=3600'
    },
    body: JSON.stringify({
      model: 'openai-large',
      stream: true,
      temperature: 0,
      seed: 42,
      messages: [
        {
          role: 'system',
          content: 'You are an HTML generator. Your task is to return a single, complete HTML file that implements what the user asks for. The HTML should be valid, self-contained, and ready to be rendered in a browser.'
        },
        {
          role: 'user',
          content: 'Create a simple calculator with addition and subtraction'
        }
      ]
    })
  });

  console.log('Status:', response1.status);
  console.log('Headers:');
  for (const [key, value] of response1.headers.entries()) {
    console.log(`  ${key}: ${value}`);
  }

  // Read and discard the stream
  for await (const chunk of response1.body) {
    process.stdout.write('.');
  }
  console.log('\nFirst request completed');

  // Wait to ensure caching completes
  console.log('Waiting 5 seconds...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Second request - should be a cache hit
  console.log('\n--- Second request (should be HIT) ---');
  const response2 = await fetch('https://text.pollinations.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'max-age=3600'
    },
    body: JSON.stringify({
      model: 'openai-large',
      stream: true,
      temperature: 0,
      seed: 42,
      messages: [
        {
          role: 'system',
          content: 'You are an HTML generator. Your task is to return a single, complete HTML file that implements what the user asks for. The HTML should be valid, self-contained, and ready to be rendered in a browser.'
        },
        {
          role: 'user',
          content: 'Create a simple hello world page'
        }
      ]
    })
  });

  console.log('Status:', response2.status);
  console.log('Headers:');
  for (const [key, value] of response2.headers.entries()) {
    console.log(`  ${key}: ${value}`);
  }

  // Read and discard the stream
  for await (const chunk of response2.body) {
    process.stdout.write('.');
  }
  console.log('\nSecond request completed');
}

testStreamingCache().catch(console.error);
