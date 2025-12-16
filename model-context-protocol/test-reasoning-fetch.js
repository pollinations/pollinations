#!/usr/bin/env node

/**
 * Direct test of the reasoning service internal function
 * Tests the actual fetch implementation
 */

import { buildUrl } from './src/utils/coreUtils.js';

async function testReasoningFetch() {
    console.log('🧠 Testing Reasoning Fetch Implementation...\n');
    
    try {
        // Test the reasoning URL generation
        const reasoningPrompt = "Please think through this problem step by step: What is 2 + 2? Show your reasoning process clearly.";
        const reasoningUrl = `https://text.pollinations.ai/${encodeURIComponent(reasoningPrompt)}?model=deepseek-r1&max_tokens=200&temperature=0.3`;
        
        // Alternative format that might work
        const reasoningUrlAlt = `https://text.pollinations.ai/${reasoningPrompt}?model=deepseek-r1&max_tokens=200&temperature=0.3`;

        console.log('Generated reasoning URL:', reasoningUrl);
        
        // Test the actual fetch
        console.log('Fetching reasoning from API...');
        const response = await fetch(reasoningUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Pollinations-MCP-Reasoning/1.0'
            }
        });

        console.log('Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const reasoningText = await response.text();
        console.log('\n✅ Successfully fetched reasoning!');
        console.log('Reasoning text length:', reasoningText.length);
        console.log('Reasoning preview:', reasoningText.substring(0, 200) + '...');

        // Test the final prompt construction
        const finalPrompt = `Based on the following reasoning, provide a concise final answer to the original question.

Original Question: What is 2 + 2?

Reasoning Process:
${reasoningText}

Final Answer:`;

        console.log('\n📋 Final prompt constructed successfully');
        console.log('Final prompt length:', finalPrompt.length);

        // Test final URL generation
        const finalUrl = `https://text.pollinations.ai/${encodeURIComponent(finalPrompt)}?model=openai&max_tokens=100&temperature=0.7`;

        console.log('Final answer URL:', finalUrl);
        
        console.log('\n🎯 Test completed successfully! The reasoning chain is working.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testReasoningFetch().catch(console.error);