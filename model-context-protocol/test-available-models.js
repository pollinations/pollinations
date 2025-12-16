#!/usr/bin/env node

/**
 * Test available models
 */

async function testAvailableModels() {
    console.log('🔍 Testing available models...\n');
    
    const testPrompt = "Hello";
    const models = [
        'openai',
        'claude',
        'claude-large',
        'deepseek',
        'llama',
        'mistral',
        'gemini',
        'grok'
    ];
    
    for (const model of models) {
        try {
            const url = `https://text.pollinations.ai/${encodeURIComponent(testPrompt)}?model=${model}`;
            console.log(`Testing ${model}...`);
            
            const response = await fetch(url, {
                method: 'GET',
                timeout: 3000
            });
            
            if (response.ok) {
                const text = await response.text();
                console.log(`  ✅ ${model}: "${text.substring(0, 30)}..."`);
            } else {
                console.log(`  ❌ ${model}: ${response.status} ${response.statusText}`);
            }
            
        } catch (error) {
            console.log(`  ❌ ${model}: ${error.message}`);
        }
    }
}

// Run the test
testAvailableModels().catch(console.error);