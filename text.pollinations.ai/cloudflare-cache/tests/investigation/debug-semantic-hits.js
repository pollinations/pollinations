import fetch from 'node-fetch';

const CACHE_URL = 'http://localhost:8888';

// Test the two prompts that are getting semantic hits instead of direct hits
const TEST_CASES = [
  {
    name: "TEST-6",
    request: {
      model: 'gpt-4',
      messages: [{"role": "user", "content": "What is machine learning and how does it work?"}],
      temperature: 0.1,
      stream: false
    }
  },
  {
    name: "TEST-9", 
    request: {
      model: 'gpt-4',
      messages: [{"role": "user", "content": "How do I cook pasta?"}],
      temperature: 0.1,
      stream: false
    }
  }
];

async function debugSemanticHits() {
  console.log('🔍 **DEBUG: Why are TEST-6 and TEST-9 getting semantic hits?**\n');
  
  for (const testCase of TEST_CASES) {
    console.log(`📡 Testing ${testCase.name}: "${testCase.request.messages[0].content}"`);
    
    // Run the request multiple times to see consistency
    const results = [];
    for (let i = 1; i <= 3; i++) {
      const result = await makeRequest(testCase.request, `${testCase.name}-${i}`);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Analysis
    console.log(`\n📊 **${testCase.name} Analysis:**`);
    results.forEach((result, i) => {
      console.log(`  Run ${i+1}: ${result.responseTime}ms | ${result.cacheType} | ${result.similarity} | ${result.cacheKey?.substring(0, 20)}...`);
    });
    
    // Check for consistency
    const allSameType = results.every(r => r.cacheType === results[0].cacheType);
    const allSameKey = results.every(r => r.cacheKey === results[0].cacheKey);
    const allSameSimilarity = results.every(r => r.similarity === results[0].similarity);
    
    console.log(`  Consistent Cache Type: ${allSameType}`);
    console.log(`  Consistent Cache Key: ${allSameKey}`);
    console.log(`  Consistent Similarity: ${allSameSimilarity}`);
    
    if (results[0].cacheType === 'semantic') {
      console.log(`  🔍 This prompt is finding a DIFFERENT cached entry with similarity ${results[0].similarity}`);
      console.log(`  🔍 The cache key it's finding: ${results[0].cacheKey}`);
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
  }
}

async function makeRequest(requestBody, label) {
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
    
    const cacheType = response.headers.get('x-cache-type') || 'none';
    const semanticSimilarity = response.headers.get('x-semantic-similarity') || 'N/A';
    const cacheKey = response.headers.get('x-cache-key') || 'N/A';
    const xCache = response.headers.get('x-cache') || 'N/A';
    
    console.log(`${label}: ${responseTime}ms | ${cacheType} | ${semanticSimilarity} | X-Cache: ${xCache}`);
    
    return {
      label,
      responseTime,
      cacheType,
      similarity: semanticSimilarity,
      cacheKey: cacheKey,
      xCache,
      status: response.status
    };
    
  } catch (error) {
    console.log(`${label}: ERROR | ${error.message}`);
    return {
      label,
      responseTime: null,
      cacheType: 'error',
      similarity: null,
      cacheKey: null,
      xCache: null,
      status: 'error'
    };
  }
}

// Run the debug test
debugSemanticHits().catch(console.error);
