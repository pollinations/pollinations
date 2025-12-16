#!/usr/bin/env node

/**
 * Test individual models
 */

async function testIndividualModels() {
    console.log('🔍 Testing individual models...\n');
    
    const testPrompt = "Hello";
    const models = ['openai', 'claude', 'gemini', 'llama', 'mistral'];
    
    for (const model of models) {
        try {
            const url = `https://text.pollinations.ai/${encodeURIComponent(testPrompt)}?model=${model}`;
            console.log(`Testing ${model}...`);
            console.log(`URL: ${url}`);
            
            const response = await fetch(url, {
                method: 'GET',
                timeout: 3000
            });
            
            console.log(`Status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const text = await response.text();
                console.log(`✅ ${model}: "${text.substring(0, 30)}..."`);
            } else {
                console.log(`❌ ${model}: ${response.status} ${response.statusText}`);
            }
            
        } catch (error) {
            console.log(`❌ ${model}: ${error.message}`);
        }
        console.log('---');
    }
}

// Run the test
testIndividualModels().catch(console.error);