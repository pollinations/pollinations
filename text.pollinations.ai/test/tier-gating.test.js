#!/usr/bin/env node

// Test script for model tier gating

const API_URL = 'http://localhost:16385';

// Test cases for different tiers and models
const testCases = [
  {
    name: "Anonymous user accessing anonymous tier model (openai-fast)",
    model: "openai-fast",
    headers: {},
    expectedStatus: 200
  },
  {
    name: "Anonymous user accessing anonymous tier model (openai)",
    model: "openai",
    headers: {},
    expectedStatus: 200
  },
  {
    name: "Anonymous user accessing flower tier model (deepseek)",
    model: "deepseek",
    headers: {},
    expectedStatus: 403
  },
  {
    name: "Seed tier user accessing seed tier model (openai)",
    model: "openai",
    headers: {
      'Authorization': `Bearer ${process.env.SEED_API_TOKEN || 'test-seed-token'}`
    },
    expectedStatus: 200
  },
  {
    name: "Seed tier user accessing seed tier model (deepseek)",
    model: "deepseek",
    headers: {
      'Authorization': `Bearer ${process.env.SEED_API_TOKEN || 'test-seed-token'}`
    },
    expectedStatus: 200
  },
  {
    name: "Seed tier user accessing seed tier model (evil)",
    model: "evil",
    headers: {
      'Authorization': `Bearer ${process.env.SEED_API_TOKEN || 'test-seed-token'}`
    },
    expectedStatus: 200
  }
];

async function runTest(testCase) {
  console.log(`\n🧪 Test: ${testCase.name}`);
  console.log(`   Model: ${testCase.model}`);
  console.log(`   Headers:`, JSON.stringify(testCase.headers));
  
  try {
    // First check what models are available to this user
    console.log(`   Checking available models for this user...`);
    const modelsResponse = await fetch(`${API_URL}/models`, {
      headers: testCase.headers
    });
    
    const modelsData = await modelsResponse.json();
    console.log(`   Available models: ${modelsData.length}`);
    console.log(`   Model tiers: ${JSON.stringify(modelsData.slice(0, 3).map(m => `${m.name}:${m.tier || 'anonymous'}`))}`); 
    
    // Check if requested model is in the list
    const modelAvailable = modelsData.some(m => m.name === testCase.model);
    console.log(`   Requested model ${testCase.model} available in /models response: ${modelAvailable ? '✅' : '❌'}`);
    
    // Now try to use the model
    const response = await fetch(`${API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...testCase.headers
      },
      body: JSON.stringify({
        model: testCase.model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      })
    });
    
    const status = response.status;
    const body = await response.text();
    
    console.log(`   Response Status: ${status}`);
    
    // Get debug headers if available
    const debugHeaders = {};
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase().startsWith('x-debug')) {
        debugHeaders[key] = value;
      }
    }
    
    if (Object.keys(debugHeaders).length > 0) {
      console.log(`   Debug Headers:`, JSON.stringify(debugHeaders, null, 2));
    }
    
    if (status === testCase.expectedStatus) {
      console.log(`   ✅ PASS: Expected status ${testCase.expectedStatus}`);
    } else {
      console.log(`   ❌ FAIL: Expected status ${testCase.expectedStatus}, got ${status}`);
      console.log(`   Response body:`, body.substring(0, 200));
    }
    
    // Parse and check error details for 403 responses
    if (status === 403) {
      try {
        const errorBody = JSON.parse(body);
        if (errorBody.error && errorBody.error.code === 'INSUFFICIENT_TIER') {
          console.log(`   ✅ Correct error code: INSUFFICIENT_TIER`);
          console.log(`   Error message:`, errorBody.error.message);
        } else {
          console.log(`   ⚠️ Unexpected error code:`, errorBody.error?.code || 'none');
        }
      } catch (e) {
        console.log(`   ⚠️  Could not parse error response`);
      }
    }
    
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
  }
}

async function testModelsEndpoint() {
  console.log(`\n🧪 Test: /models endpoint filtering`);
  
  try {
    // Test anonymous access
    console.log(`\n   Testing anonymous access to /models:`);
    const anonResponse = await fetch(`${API_URL}/models`);
    const anonModels = await anonResponse.json();
    const anonTierModels = anonModels.filter(m => !m.tier || m.tier === 'anonymous');
    console.log(`   Total models: ${anonModels.length}`);
    console.log(`   Anonymous tier models: ${anonTierModels.length}`);
    console.log(`   Should only see anonymous models: ${anonModels.length === anonTierModels.length ? '✅' : '❌'}`);
    
    // Show some example models
    console.log(`   Example models:`, anonModels.slice(0, 3).map(m => `${m.name} (tier: ${m.tier || 'anonymous'})`));
    
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
  }
}

async function main() {
  console.log('🚀 Starting model tier gating tests...');
  console.log(`   API URL: ${API_URL}`);
  
  // First test the /models endpoint
  await testModelsEndpoint();
  
  // Then test individual model access
  for (const testCase of testCases) {
    await runTest(testCase);
  }
  
  console.log('\n✨ Tests complete!');
}

main().catch(console.error);
