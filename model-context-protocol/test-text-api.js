#!/usr/bin/env node

/**
 * Simple test to understand the text API format
 */

async function testTextAPI() {
    console.log('🧪 Testing Text API Format...\n');
    
    const testPrompts = [
        "Hello world",
        "What is 2+2?",
        "Simple test"
    ];
    
    for (const prompt of testPrompts) {
        try {
            console.log(`\nTesting prompt: "${prompt}"`);
            
            // Test different URL formats
            const urls = [
                `https://text.pollinations.ai/${encodeURIComponent(prompt)}`,
                `https://text.pollinations.ai/${prompt}`,
                `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai`,
                `https://text.pollinations.ai/p/${encodeURIComponent(prompt)}`,
            ];
            
            for (const url of urls) {
                try {
                    console.log(`  Trying: ${url}`);
                    const response = await fetch(url, {
                        method: 'GET',
                        timeout: 5000
                    });
                    
                    if (response.ok) {
                        const text = await response.text();
                        console.log(`  ✅ Success! Response: "${text.substring(0, 50)}..."`);
                        break;
                    } else {
                        console.log(`  ❌ Failed: ${response.status} ${response.statusText}`);
                    }
                } catch (error) {
                    console.log(`  ❌ Error: ${error.message}`);
                }
            }
        } catch (error) {
            console.log(`Error testing "${prompt}": ${error.message}`);
        }
    }
}

// Run the test
testTextAPI().catch(console.error);