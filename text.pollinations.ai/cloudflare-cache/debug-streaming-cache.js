// Debug script for streaming cache
import fetch from 'node-fetch';

const sunCalcBody = JSON.stringify({
  model: 'openai-large',
  stream: true,
  temperature: 0,
  seed: 12345,
  messages: [
    {
      role: 'system',
      content: 'You are an HTML generator. Your task is to return a single, complete HTML file that implements what the user asks for.\nThe HTML should be valid, self-contained, and ready to be rendered in a browser.\n\nInclude all necessary CSS inline within a <style> tag in the head section.\nInclude all necessary JavaScript within <script> tags, preferably at the end of the body.\nMake the design clean, modern, and responsive.\nWrite the code in a sequence that lets the browser already render something meaningful while it is being transmitted.\nThe UI will be incrementally shown as the code is streamed to the frontend.\nImagine you are coding for a demoscene challenge where code should be short and elegant.\nUse images from src=\"https://image.pollinations.ai/prompt/[urlencoded prompt]?width=[width]&height=[height]\"\nLinks to subpages should always be relative without a leading slash. Don\'t use JS-based links unless it is triggering something interactive. New content should usually come by following a real link.\nYou are targeting modern browsers.\nPlease include open-graph metatags and use a Pollinations image for the thumbnail / image preview. include \'og:image:width\' and \'og:image:height\''
    },
    {
      role: 'user',
      content: 'a calculator that can show the pattern the sun across a 360 degree view depending on lattitude, interactive slider controls for time of year and longitude, she the full daily plot and also a play button to play the animation of 1 day in 8 seconds in loop. the tool is to be used for sun panel installation, add features that help people calculate the best position and angle for maximum yearly efficiency'
    }
  ]
});

async function testStreamingCache() {
  console.log('Testing streaming cache...');

  // First request - should be a cache miss
  console.log('\n--- First request (should be MISS) ---');
  const response1 = await fetch('https://text.pollinations.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'max-age=3600'
    },
    body: sunCalcBody,
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

  // Wait much longer to ensure caching completes
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
    body: sunCalcBody
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
