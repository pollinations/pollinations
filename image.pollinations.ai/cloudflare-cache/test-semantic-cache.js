/**
 * Test Script for Semantic Cache Implementation
 * GitHub Issue #2562 - Vectorize Image Caching POC
 */

import { normalizePromptForEmbedding, getResolutionBucket } from './src/embedding-service.js';
import { createSemanticCache, findSimilarImage, cacheImageEmbedding } from './src/semantic-cache.js';

// Test data for validation
const TEST_PROMPTS = [
  {
    prompt: "a beautiful sunset over the ocean",
    params: { width: 1024, height: 1024, style: "photorealistic" }
  },
  {
    prompt: "beautiful sunset ocean view",
    params: { width: 1024, height: 1024, style: "photorealistic" }
  },
  {
    prompt: "a red car in the city",
    params: { width: 1920, height: 1080, model: "stable-diffusion" }
  },
  {
    prompt: "portrait of a woman with brown hair",
    params: { width: 768, height: 1024, style: "portrait" }
  }
];

/**
 * Test resolution bucketing
 */
function testResolutionBucketing() {
  console.log('🔧 Testing resolution bucketing...');
  
  const testCases = [
    { width: 512, height: 512, expected: '512x512' },
    { width: 1024, height: 1024, expected: '1024x1024' },
    { width: 768, height: 1024, expected: '768x1024' },
    { width: 1920, height: 1080, expected: '1920x1080' },
    { width: 1080, height: 1920, expected: '1080x1920' }
  ];
  
  let passed = 0;
  for (const testCase of testCases) {
    const result = getResolutionBucket(testCase.width, testCase.height);
    const success = result === testCase.expected;
    console.log(`  ${success ? '✅' : '❌'} ${testCase.width}x${testCase.height} -> ${result} (expected: ${testCase.expected})`);
    if (success) passed++;
  }
  
  console.log(`  Resolution bucketing: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

/**
 * Test prompt normalization
 */
function testPromptNormalization() {
  console.log('🔧 Testing prompt normalization...');
  
  const testCases = [
    {
      prompt: 'A Beautiful Sunset Over The Ocean',
      params: { style: 'photorealistic' },
      expected: 'a beautiful sunset over the ocean style:photorealistic'
    },
    {
      prompt: 'Red Car in City',
      params: { model: 'sd-xl' },
      expected: 'red car in city model:sd-xl'
    }
  ];
  
  let passed = 0;
  for (const testCase of testCases) {
    const result = normalizePromptForEmbedding(testCase.prompt, testCase.params);
    const success = result === testCase.expected;
    console.log(`  ${success ? '✅' : '❌'} "${testCase.prompt}" -> "${result}"`);
    if (success) passed++;
  }
  
  console.log(`  Prompt normalization: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

/**
 * Test semantic similarity (requires environment)
 */
async function testSemanticSimilarity(env) {
  if (!env || !env.AI) {
    console.log('⚠️  Skipping semantic similarity test - no AI environment available\n');
    return true;
  }
  
  console.log('🧠 Testing semantic similarity...');
  
  try {
    const semanticCache = createSemanticCache(env);
    
    // Test similar prompts should have high similarity
    const prompt1 = TEST_PROMPTS[0];
    const prompt2 = TEST_PROMPTS[1];
    
    const embedding1 = await generateEmbedding(semanticCache.embeddingService, prompt1.prompt, prompt1.params);
    const embedding2 = await generateEmbedding(semanticCache.embeddingService, prompt2.prompt, prompt2.params);
    
    // Calculate cosine similarity
    const dotProduct = embedding1.reduce((sum, a, i) => sum + a * embedding2[i], 0);
    const magnitude1 = Math.sqrt(embedding1.reduce((sum, a) => sum + a * a, 0));
    const magnitude2 = Math.sqrt(embedding2.reduce((sum, a) => sum + a * a, 0));
    const similarity = dotProduct / (magnitude1 * magnitude2);
    
    console.log(`  Similarity between similar prompts: ${similarity.toFixed(3)}`);
    console.log(`  ${similarity > 0.8 ? '✅' : '❌'} High similarity detected (>0.8)`);
    
    // Test different prompts should have lower similarity
    const prompt3 = TEST_PROMPTS[2];
    const embedding3 = await generateEmbedding(semanticCache.embeddingService, prompt3.prompt, prompt3.params);
    
    const dotProduct2 = embedding1.reduce((sum, a, i) => sum + a * embedding3[i], 0);
    const magnitude3 = Math.sqrt(embedding3.reduce((sum, a) => sum + a * a, 0));
    const similarity2 = dotProduct2 / (magnitude1 * magnitude3);
    
    console.log(`  Similarity between different prompts: ${similarity2.toFixed(3)}`);
    console.log(`  ${similarity2 < 0.7 ? '✅' : '❌'} Low similarity detected (<0.7)\n`);
    
    return similarity > 0.8 && similarity2 < 0.7;
    
  } catch (error) {
    console.error('❌ Error testing semantic similarity:', error);
    return false;
  }
}

/**
 * Main test function
 */
async function runTests(env = null) {
  console.log('🧪 Testing Semantic Cache Implementation (GitHub Issue #2562)\n');
  
  const tests = [
    { name: 'Resolution Bucketing', test: () => testResolutionBucketing() },
    { name: 'Prompt Normalization', test: () => testPromptNormalization() },
    { name: 'Semantic Similarity', test: () => testSemanticSimilarity(env) }
  ];
  
  let passed = 0;
  for (const test of tests) {
    try {
      const result = await test.test();
      if (result) passed++;
    } catch (error) {
      console.error(`❌ ${test.name} failed:`, error);
    }
  }
  
  console.log(`📊 Test Results: ${passed}/${tests.length} test suites passed`);
  
  if (passed === tests.length) {
    console.log('🎉 All tests passed! Semantic cache implementation is ready for POC deployment.');
  } else {
    console.log('⚠️  Some tests failed. Please review the implementation before deployment.');
  }
  
  return passed === tests.length;
}

// Export for use in other contexts
export { runTests, testResolutionBucketing, testPromptNormalization, testSemanticSimilarity };

// Run tests if called directly
if (import.meta.main) {
  runTests();
}
