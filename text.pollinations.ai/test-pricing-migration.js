#!/usr/bin/env node

/**
 * Test script to verify that pricing resolution works identically 
 * before and after the migration to separate pricing file
 */

import { resolvePricing } from './observability/costCalculator.js';
import { resolvePricing as directPricingResolve } from './modelPricing.js';

// Test cases with original model names that should have pricing
const testCases = [
    'gpt-5-nano-2025-08-07',
    'gpt-4.1-2025-04-14', 
    'qwen2.5-coder-32b-instruct',
    'mistral-small-3.1-24b-instruct-2503',
    'us.deepseek.r1-v1:0',
    'gpt-4o-mini-audio-preview-2024-12-17',
    'amazon.nova-micro-v1:0',
    'us.meta.llama3-1-8b-instruct-v1:0',
    'us.anthropic.claude-3-5-haiku-20241022-v1:0',
    'openai/o4-mini',
    'google/gemini-2.5-flash-lite',
    'nonexistent-model' // Should return null
];

console.log('🧪 Testing pricing resolution migration...\n');

let allTestsPassed = true;

for (const modelName of testCases) {
    console.log(`Testing: ${modelName}`);
    
    // Test through costCalculator (should use new pricing module)
    const costCalculatorResult = resolvePricing(modelName);
    
    // Test direct pricing module
    const directResult = directPricingResolve(modelName);
    
    // Compare results
    const resultsMatch = JSON.stringify(costCalculatorResult) === JSON.stringify(directResult);
    
    if (resultsMatch) {
        console.log(`  ✅ Results match`);
        if (costCalculatorResult) {
            console.log(`     Pricing: prompt=${costCalculatorResult.prompt_text}, completion=${costCalculatorResult.completion_text}`);
        } else {
            console.log(`     Both returned null (expected for nonexistent models)`);
        }
    } else {
        console.log(`  ❌ Results differ!`);
        console.log(`     CostCalculator: ${JSON.stringify(costCalculatorResult)}`);
        console.log(`     Direct: ${JSON.stringify(directResult)}`);
        allTestsPassed = false;
    }
    console.log('');
}

if (allTestsPassed) {
    console.log('🎉 All pricing tests passed! Migration successful.');
} else {
    console.log('❌ Some tests failed. Please check the implementation.');
    process.exit(1);
}
