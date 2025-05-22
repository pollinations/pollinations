import test from 'node:test';
import assert from 'node:assert';
import { Readable } from 'stream';
import { getHandler } from '../availableModels.js';

// Helper function to wait for a promise with timeout
const withTimeout = (promise, timeout) => {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => 
      setTimeout(() => reject(new Error(`Timed out after ${timeout}ms`)), timeout)
    )
  ]);
};

// Helper to collect all chunks from a stream
const collectStream = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk.toString());
  }
  return chunks.join('');
};

test('DeepSeek Reasoning model should include <think> tags in streaming mode', async (t) => {
  // This test is only a verification helper and will be skipped in regular CI
  // since it requires actual API credentials
  if (!process.env.TEST_REASONING_STREAMING) {
    console.log('Skipping reasoning streaming test - set TEST_REASONING_STREAMING=1 to run');
    return;
  }

  // Get the handler for the deepseek-reasoning model
  const handler = getHandler('deepseek-reasoning');
  
  // Create a simple message that should trigger reasoning
  const messages = [
    { role: 'user', content: 'What is 15 + 27? Please think step by step.' }
  ];
  
  // Call the handler with streaming enabled
  const response = await withTimeout(
    handler(messages, { stream: true }),
    30000 // 30 second timeout
  );
  
  // Verify we got a streaming response
  assert.strictEqual(response.stream, true, 'Response should be streaming');
  assert.ok(response.responseStream, 'Response should have a responseStream');
  
  // Collect all chunks from the stream
  const fullStreamContent = await collectStream(response.responseStream);
  
  // Look for think tags in the streaming output
  const hasThinkTags = fullStreamContent.includes('<think>') && fullStreamContent.includes('</think>');
  
  // If the test fails, show the full stream content for debugging
  if (!hasThinkTags) {
    console.error('Stream content:', fullStreamContent);
  }
  
  assert.ok(hasThinkTags, 'Stream should include <think> tags');
  
  // Verify the structure of the think tags
  assert.ok(
    /<think>.*?<\/think>/.test(fullStreamContent),
    'Think tags should properly wrap content'
  );
  
  console.log('✅ Reasoning model streaming <think> tags test passed!');
});
