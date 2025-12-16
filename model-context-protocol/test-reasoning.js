#!/usr/bin/env node

/**
 * Test script for the enhanced reasoning service
 * Tests the actual fetch implementation
 */

import { deepReasoning } from './src/services/reasoningService.js';

async function testReasoningService() {
    console.log('🧠 Testing Enhanced Reasoning Service...\n');
    
    try {
        console.log('Testing deep reasoning with a simple question...');
        const result = await deepReasoning({
            prompt: "What is the meaning of life?",
            context: "From a philosophical and scientific perspective",
            reasoningModel: "deepseek-r1",
            finalModel: "openai",
            maxReasoningTokens: 500,
            maxFinalTokens: 200
        });

        console.log('✅ Reasoning test completed successfully!');
        console.log('Response structure:', Object.keys(result));
        
        if (result.content && result.content[0]) {
            console.log('\n📋 Response preview:');
            console.log(result.content[0].text.substring(0, 300) + '...');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testReasoningService();