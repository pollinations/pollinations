import test from 'ava';
import debug from 'debug';
import { transformCloudflareRequest } from './transformCloudflareRequest.js';

const log = debug('pollinations:test:cloudflare-seed');
const errorLog = debug('pollinations:test:cloudflare-seed:error');

// Configure higher timeout for all tests
test.beforeEach(t => {
    t.timeout(60000); // 60 seconds in milliseconds
});

// Mock environment variables for testing
process.env.CLOUDFLARE_AUTH_TOKEN = process.env.CLOUDFLARE_AUTH_TOKEN || 'test-token';
process.env.CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'test-account-id';

/**
 * Test: Verify Cloudflare request transformation removes seed parameter
 * 
 * Purpose: Ensure that the seed parameter is removed from Cloudflare requests
 */
test('transformCloudflareRequest should remove seed parameter', t => {
    // Create a test request body with a seed parameter
    const testRequestBody = {
        model: 'llama',
        messages: [{ role: 'user', content: 'Test message' }],
        temperature: 0.7,
        seed: 12345
    };
    
    // Transform the request body
    const transformedBody = transformCloudflareRequest(testRequestBody);
    
    // Verify the seed parameter is removed
    t.false('seed' in transformedBody, 'Seed parameter should be removed from the request body');
    
    // Verify other parameters are preserved
    t.is(transformedBody.model, testRequestBody.model, 'Model parameter should be preserved');
    t.is(transformedBody.temperature, testRequestBody.temperature, 'Temperature parameter should be preserved');
    t.deepEqual(transformedBody.messages, testRequestBody.messages, 'Messages should be preserved');
});

/**
 * Test: Verify Cloudflare request transformation in streaming mode
 * 
 * Purpose: Ensure that the seed parameter is removed from Cloudflare streaming requests
 */
test('transformCloudflareRequest should remove seed parameter in streaming mode', t => {
    // Create a test request body with a seed parameter and stream: true
    const testRequestBody = {
        model: 'llama',
        messages: [{ role: 'user', content: 'Test streaming message' }],
        temperature: 0.7,
        stream: true,
        seed: 12345
    };
    
    // Transform the request body
    const transformedBody = transformCloudflareRequest(testRequestBody);
    
    // Verify the seed parameter is removed
    t.false('seed' in transformedBody, 'Seed parameter should be removed from the streaming request body');
    
    // Verify other parameters are preserved
    t.is(transformedBody.model, testRequestBody.model, 'Model parameter should be preserved');
    t.is(transformedBody.temperature, testRequestBody.temperature, 'Temperature parameter should be preserved');
    t.is(transformedBody.stream, testRequestBody.stream, 'Stream parameter should be preserved');
    t.deepEqual(transformedBody.messages, testRequestBody.messages, 'Messages should be preserved');
});
