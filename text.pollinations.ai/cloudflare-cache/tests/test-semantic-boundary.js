import fetch from 'node-fetch';

const CACHE_URL = 'http://localhost:8888';

console.log('🎯 Semantic Caching Boundary Test');
console.log('Testing 30 prompts with varying similarity to find the caching threshold');
console.log('Current threshold: 0.92 (92%)\n');

// Base prompt for comparison 
const BASE_PROMPT = "What is artificial intelligence and how does it work?";

// Test prompts with varying degrees of similarity
const TEST_PROMPTS = [
  // IDENTICAL/NEAR-IDENTICAL (Expected: 95%+ similarity)
  "What is artificial intelligence and how does it work?", // Exact match
  "What is artificial intelligence and how does it work ?", // Extra space
  "What is artificial intelligence and how does it work.", // Period instead of ?
  
  // VERY SIMILAR - Different phrasing (Expected: 90-95% similarity) 
  "What is AI and how does it work?",
  "Can you explain what artificial intelligence is and how it works?",
  "How does artificial intelligence work and what is it?",
  "What is artificial intelligence? How does it work?",
  
  // SIMILAR TOPIC - Different questions (Expected: 85-90% similarity)
  "What are the benefits of artificial intelligence?",
  "How is artificial intelligence used in business?", 
  "What are the different types of artificial intelligence?",
  "What is machine learning vs artificial intelligence?",
  
  // RELATED TECH TOPICS (Expected: 75-85% similarity)
  "What is machine learning and how does it work?",
  "What is deep learning and neural networks?",
  "How do computer algorithms work?",
  "What is data science and analytics?",
  "What is robotics and automation?",
  
  // LOOSELY RELATED (Expected: 60-75% similarity)  
  "What is computer programming and coding?",
  "How do computers process information?",
  "What is software development?",
  "What are databases and how do they work?",
  "What is cybersecurity and data protection?",
  
  // DIFFERENT TOPICS (Expected: 40-60% similarity)
  "What is renewable energy and how does it work?",
  "How does photosynthesis work in plants?", 
  "What is quantum physics and quantum mechanics?",
  "How does the human brain process memories?",
  "What is climate change and global warming?",
  
  // VERY DIFFERENT (Expected: 20-40% similarity)
  "How do I bake chocolate chip cookies?",
  "What are the best travel destinations in Europe?",
  "How do I take care of houseplants?",
  "What is the history of ancient Rome?",
  "How do I learn to play guitar?",
];

console.log('📝 **Message-to-String Conversion Process:**');
console.log('Messages like: {"role": "user", "content": "Hello"}');
console.log('Become: "[USER] Hello"');  
console.log('Multiple messages joined with newlines\n');

async function testSemanticBoundary() {
  console.log('🔄 Step 1: Establishing base cache entry...\n');
  
  // First, establish the base prompt in cache
  await makeRequest(BASE_PROMPT, "BASE");
  
  console.log('\n🔍 Step 2: Testing similarity boundaries...\n');
  
  // Test all prompts against the base
  const results = [];
  
  for (let i = 0; i < TEST_PROMPTS.length; i++) {
    const prompt = TEST_PROMPTS[i];
    const result = await makeRequest(prompt, `TEST-${i+1}`);
    results.push(result);
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n📊 **SEMANTIC CACHING BOUNDARY ANALYSIS:**\n');
  
  // Sort results by similarity score
  const validResults = results.filter(r => r.similarity !== 'N/A' && r.similarity !== null);
  validResults.sort((a, b) => parseFloat(b.similarity || 0) - parseFloat(a.similarity || 0));
  
  console.log('🟢 **SEMANTIC CACHE HITS (Above 0.92 threshold):**');
  validResults.filter(r => parseFloat(r.similarity) >= 0.92).forEach(r => {
    console.log(`  ${r.similarity} - "${r.prompt.substring(0, 50)}..."`);
  });
  
  console.log('\n🟡 **NEAR MISSES (0.85-0.92 range):**');
  validResults.filter(r => parseFloat(r.similarity) >= 0.85 && parseFloat(r.similarity) < 0.92).forEach(r => {
    console.log(`  ${r.similarity} - "${r.prompt.substring(0, 50)}..."`);
  });
  
  console.log('\n🔵 **MODERATE SIMILARITY (0.70-0.85 range):**');
  validResults.filter(r => parseFloat(r.similarity) >= 0.70 && parseFloat(r.similarity) < 0.85).forEach(r => {
    console.log(`  ${r.similarity} - "${r.prompt.substring(0, 50)}..."`);
  });
  
  console.log('\n🟠 **LOW SIMILARITY (Below 0.70):**');
  validResults.filter(r => parseFloat(r.similarity) < 0.70).forEach(r => {
    console.log(`  ${r.similarity} - "${r.prompt.substring(0, 50)}..."`);
  });
  
  // Cache type distribution
  const cacheHits = results.filter(r => r.cacheType === 'hit').length;
  const semanticHits = results.filter(r => r.cacheType === 'semantic').length;
  const misses = results.filter(r => r.cacheType === 'miss' || r.cacheType === 'none').length;
  
  console.log('\n📈 **CACHE PERFORMANCE SUMMARY:**');
  console.log(`  Direct Cache Hits: ${cacheHits}`);
  console.log(`  Semantic Cache Hits: ${semanticHits}`);
  console.log(`  Cache Misses: ${misses}`);
  console.log(`  Total Requests: ${results.length}`);
  
  if (semanticHits > 0) {
    const avgSimilarity = validResults
      .filter(r => r.cacheType === 'semantic')
      .reduce((sum, r) => sum + parseFloat(r.similarity), 0) / semanticHits;
    console.log(`  Average Semantic Similarity: ${avgSimilarity.toFixed(4)}`);
  }
}

async function makeRequest(content, testName) {
  const requestBody = {
    model: 'gpt-4',
    messages: [{"role": "user", "content": content}],
    temperature: 0.1,  
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
    
    const cacheType = response.headers.get('x-cache-type') || 'none';
    const semanticSimilarity = response.headers.get('x-semantic-similarity') || 'N/A';
    
    console.log(`${testName}: ${responseTime}ms | ${cacheType} | ${semanticSimilarity} | "${content.substring(0, 40)}..."`);
    
    return {
      testName,
      prompt: content,
      responseTime, 
      cacheType,
      similarity: semanticSimilarity,
      status: response.status
    };
    
  } catch (error) {
    console.log(`${testName}: ERROR | ${error.message}`);
    return {
      testName,
      prompt: content,
      responseTime: null,
      cacheType: 'error',
      similarity: null,
      status: 'error'
    };
  }
}

testSemanticBoundary().catch(console.error);
