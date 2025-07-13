import fetch from 'node-fetch';

const CACHE_URL = 'http://localhost:8888';

console.log('🔍 Model-Specific Semantic Cache Test');
console.log('Testing model isolation and semantic caching behavior\n');

async function testRequest(testName, model, content) {
  console.log(`\n=== ${testName} ===`);
  
  const requestBody = {
    model: model,
    messages: [{"role": "user", "content": content}],
    temperature: 0.3,
    stream: false
  };

  const startTime = Date.now();
  
  try {
    const response = await fetch(`${CACHE_URL}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    const data = await response.text();
    
    // Extract cache headers
    const xCache = response.headers.get('X-Cache') || 'MISS';
    const cacheType = response.headers.get('x-cache-type') || 'none';
    const semanticSimilarity = response.headers.get('x-semantic-similarity');
    const cacheModel = response.headers.get('x-cache-model');
    
    console.log(`Status: ${response.status}`);
    console.log(`Response Time: ${responseTime}ms`);
    console.log(`X-Cache: ${xCache}`);
    console.log(`Cache Type: ${cacheType}`);
    console.log(`Semantic Similarity: ${semanticSimilarity || 'N/A'}`);
    console.log(`Cache Model: ${cacheModel || 'N/A'}`);
    
    // Show response preview
    try {
      const responseData = JSON.parse(data);
      if (responseData.choices && responseData.choices[0] && responseData.choices[0].message) {
        const content = responseData.choices[0].message.content;
        console.log(`Response: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
      }
    } catch (parseError) {
      console.log(`Raw response: ${data.substring(0, 200)}...`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('🚀 Starting model isolation tests...');
  
  // Test 1: Same content, different models - should get different cache buckets
  await testRequest('GPT-4 Model - AI Question', 'gpt-4', 'What is artificial intelligence?');
  await testRequest('Same content, Mistral Model', 'mistral-small', 'What is artificial intelligence?');
  await testRequest('Same content, GPT-4 again (should hit cache)', 'gpt-4', 'What is artificial intelligence?');

  // Test 2: Slightly different content, same model - should test semantic matching
  await testRequest('GPT-4 - Slightly Different AI Question', 'gpt-4', 'What is artificial intelligence exactly?');
  
  // Test 3: Completely different topic, same model
  await testRequest('GPT-4 - Different Topic (Cooking)', 'gpt-4', 'How do I make chocolate chip cookies?');
  
  console.log('\n🎯 Model isolation test completed!');
  console.log('\n📊 Expected Results:');
  console.log('- First request: MISS (new cache entry)');
  console.log('- Same content + different model: MISS (model isolation)');
  console.log('- Same content + same model: HIT (exact cache)');
  console.log('- Similar content + same model: Semantic HIT (if above threshold)');
  console.log('- Different content + same model: MISS or low similarity');
}

runTests().catch(console.error);
