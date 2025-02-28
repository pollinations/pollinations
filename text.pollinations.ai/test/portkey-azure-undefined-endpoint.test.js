import test from 'ava';
import dotenv from 'dotenv';
import debug from 'debug';
import { extractBaseUrl, extractResourceName } from '../generateTextPortkey.js';

const log = debug('pollinations:test:portkey-azure-undefined');
const errorLog = debug('pollinations:test:portkey-azure-undefined:error');

dotenv.config();

/**
 * Test: Azure OpenAI Endpoint URL Extraction
 * 
 * Purpose: Verify that the extractBaseUrl and extractResourceName functions handle undefined or invalid endpoints gracefully
 * 
 * Expected behavior:
 * 1. extractBaseUrl should return null for undefined endpoints
 * 2. extractResourceName should return a default value for undefined endpoints
 */
test('extractBaseUrl should handle undefined endpoints gracefully', t => {
    // Test with undefined endpoint
    const result1 = extractBaseUrl(undefined);
    t.is(result1, null, 'Should return null for undefined endpoint');
    
    // Test with null endpoint
    const result2 = extractBaseUrl(null);
    t.is(result2, null, 'Should return null for null endpoint');
    
    // Test with invalid endpoint
    const result3 = extractBaseUrl('invalid-endpoint');
    t.is(result3, 'invalid-endpoint', 'Should return the original string for invalid endpoint');
    
    // Test with valid endpoint
    const result4 = extractBaseUrl('https://pollinations.openai.azure.com/openai/deployments/gpt-4o/chat/completions');
    t.is(result4, 'https://pollinations.openai.azure.com', 'Should extract base URL correctly');
});

test('extractResourceName should handle undefined endpoints gracefully', t => {
    // Test with undefined endpoint
    const result1 = extractResourceName(undefined);
    t.is(result1, null, 'Should return null for undefined endpoint');
    
    // Test with null endpoint
    const result2 = extractResourceName(null);
    t.is(result2, null, 'Should return null for null endpoint');
    
    // Test with invalid endpoint
    const result3 = extractResourceName('invalid-endpoint'); 
    t.is(result3, 'pollinations', 'Should return default value "pollinations" for invalid endpoint');
    
    // Test with valid endpoint
    const result4 = extractResourceName('https://pollinations.openai.azure.com/openai/deployments/gpt-4o/chat/completions');
    t.is(result4, 'pollinations', 'Should extract resource name correctly');
});