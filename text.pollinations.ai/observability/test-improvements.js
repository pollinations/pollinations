#!/usr/bin/env node

/**
 * Simple test to verify observability improvements
 */

import { calculateTotalCost, calculateCostBreakdown } from './costCalculator.js';
import { validateTokenData } from './validation.js';
import { getProviderNameFromModel, resolveModelForPricing } from './modelResolver.js';
import { TOKENS_PER_MILLION } from './constants.js';

console.log('🧪 Testing Observability System Improvements\n');

// Test 1: Valid token data
console.log('✅ Test 1: Valid token data calculation');
const validTokenData = {
    completion_text_token_generated: 100,
    completion_audio_token_generated: 0,
    prompt_text_token_generated: 50,
    prompt_audio_token_generated: 0,
    prompt_cached_token_generated: 0,
    completion_text_token_price: 20, // per million
    completion_audio_token_price: 0,
    prompt_text_token_price: 10, // per million
    prompt_audio_token_price: 0,
    prompt_cached_token_price: 0
};

try {
    const cost = calculateTotalCost(validTokenData);
    const breakdown = calculateCostBreakdown(validTokenData);
    console.log(`   Cost: $${cost.toFixed(6)}`);
    console.log(`   Expected: $${((100 * 20 + 50 * 10) / TOKENS_PER_MILLION).toFixed(6)}`);
    console.log(`   Breakdown:`, breakdown);
} catch (error) {
    console.error('   ❌ Error:', error.message);
}

// Test 2: Invalid token data (should throw error)
console.log('\n✅ Test 2: Invalid token data validation');
try {
    calculateTotalCost({ invalid: 'data' });
    console.log('   ❌ Should have thrown an error');
} catch (error) {
    console.log(`   ✅ Correctly caught error: ${error.message}`);
}

// Test 3: Model resolution
console.log('\n✅ Test 3: Model resolution');
const provider = getProviderNameFromModel('gpt-4');
console.log(`   Provider for gpt-4: ${provider}`);

const resolution = resolveModelForPricing('gpt-4', 'gpt-4-0613');
console.log(`   Resolution method: ${resolution.resolutionMethod}`);
console.log(`   Model for pricing: ${resolution.modelForPricing}`);

console.log('\n🎉 All tests completed!');
