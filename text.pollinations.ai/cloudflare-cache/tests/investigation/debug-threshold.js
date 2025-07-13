import fetch from 'node-fetch';

const CACHE_URL = 'http://localhost:8888';

console.log('🔍 Debug Threshold Test - Testing Completely Different Conversations');

async function testRequest(testName, messages) {
  console.log(`\n=== ${testName} ===`);
  
  const requestBody = {
    model: 'openai',
    messages: [{"role":"user","content":"test123... this one is about being weird and old.. nothing to do with the previous one"}, ...messages],
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
    const cacheType = response.headers.get('x-cache-type') || 'unknown';
    const semanticSimilarity = response.headers.get('x-semantic-similarity');
    const cacheModel = response.headers.get('x-cache-model');
    
    console.log(`Status: ${response.status}`);
    console.log(`Response Time: ${responseTime}ms`);
    console.log(`Cache Type: ${cacheType}`);
    console.log(`Semantic Similarity: ${semanticSimilarity}`);
    console.log(`Cache Model: ${cacheModel}`);
    
    // Show response preview
    try {
      const responseData = JSON.parse(data);
      if (responseData.choices && responseData.choices[0] && responseData.choices[0].message) {
        const content = responseData.choices[0].message.content;
        console.log(`Response: "${content.substring(0, 150)}${content.length > 150 ? '...' : ''}"`);
      }
    } catch (e) {
      console.log(`Raw Response: ${data.substring(0, 150)}...`);
    }
    
    return { cacheType, semanticSimilarity, responseTime };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { error: error.message };
  }
}

async function runThresholdTest() {
  console.log('Testing completely different topics that should NOT be semantically similar\n');
  
  // Test 1: Math problem
  await testRequest('Test 1: Math Problem', [
    { role: 'system', content: 'You are a math tutor.' },
    { role: 'user', content: 'Calculate the derivative of x^2 + 3x + 5' }
  ]);
  
  // Test 2: Cooking recipe
  await testRequest('Test 2: Cooking Recipe', [
    { role: 'system', content: 'You are a chef.' },
    { role: 'user', content: 'How do I make chocolate chip cookies?' }
  ]);
  
  // Test 3: Space facts
  await testRequest('Test 3: Space Facts', [
    { role: 'system', content: 'You are an astronomy expert.' },
    { role: 'user', content: 'Tell me about black holes and their properties.' }
  ]);
  
  // Test 4: Programming help
  await testRequest('Test 4: Programming Help', [
    { role: 'system', content: 'You are a coding assistant.' },
    { role: 'user', content: 'Explain how to implement a binary search tree in JavaScript.' }
  ]);
  
  // Test 5: Medical advice (should be very different)
  await testRequest('Test 5: Medical Question', [
    { role: 'system', content: 'You are a medical information assistant.' },
    { role: 'user', content: 'What are the symptoms of vitamin D deficiency?' }
  ]);
  
  console.log('\n🎯 Threshold test completed!');
  console.log('\n📊 Analysis:');
  console.log('- If all show high similarity (>95%), the threshold is too low');
  console.log('- If all show semantic cache hits, the system is broken');
  console.log('- Different topics should have low similarity or cache misses');
}

runThresholdTest().catch(console.error);
