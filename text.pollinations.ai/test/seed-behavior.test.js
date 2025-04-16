import test from 'ava';
import axios from 'axios';
import app from '../server.js';
import debug from 'debug';
import { setupTestServer, generateRandomSeed } from './test-utils.js';
import { availableModels } from '../availableModels.js';

const log = debug('pollinations:test:seed-behavior');
const errorLog = debug('pollinations:test:seed-behavior:error');

// Configure higher timeout for all tests
test.beforeEach(t => {
    t.timeout(60000); // 60 seconds
});

let server;
let baseUrl;
let axiosInstance;

// Start local server before tests
test.before(async t => {
    const setup = await setupTestServer(app);
    server = setup.server;
    baseUrl = setup.baseUrl;
    axiosInstance = setup.axiosInstance;
});

// Clean up server after tests
test.after.always(t => {
    if (server) {
        server.close();
    }
});

/**
 * Test: Seed behavior on main endpoint
 * 
 * Purpose: Verify that seeds work correctly on the main endpoint for non-Cloudflare models
 */
test('Main endpoint should respect seed parameter for non-Cloudflare models', async t => {
    // Find a non-Cloudflare model that supports seed
    const nonCloudflareModels = availableModels.filter(m => 
        m.provider !== 'Cloudflare' && !m.name.includes('llama') && !m.name.includes('phi')
    );
    
    if (nonCloudflareModels.length === 0) {
        t.pass('No non-Cloudflare models available for testing');
        return;
    }
    
    const testModel = nonCloudflareModels[0];
    log(`Testing seed behavior with model: ${testModel.name}`);
    
    // Use the same seed for two identical requests
    const seed = 12345;
    const prompt = "Generate a random number between 1 and 1000";
    
    try {
        // First request with seed
        const firstResponse = await axiosInstance.post('/', {
            messages: [{ role: 'user', content: prompt }],
            model: testModel.name,
            seed: seed,
            cache: false
        });
        
        // Second request with the same seed
        const secondResponse = await axiosInstance.post('/', {
            messages: [{ role: 'user', content: prompt }],
            model: testModel.name,
            seed: seed,
            cache: false
        });
        
        // Get the response content
        const firstContent = firstResponse.data;
        const secondContent = secondResponse.data;
        
        // The responses should be identical when using the same seed
        t.deepEqual(firstContent, secondContent, 'Responses should be identical with the same seed');
        
        // Now use a different seed
        const differentSeed = seed + 1;
        const thirdResponse = await axiosInstance.post('/', {
            messages: [{ role: 'user', content: prompt }],
            model: testModel.name,
            seed: differentSeed,
            cache: false
        });
        
        const thirdContent = thirdResponse.data;
        
        // The response with a different seed should be different
        t.notDeepEqual(firstContent, thirdContent, 'Responses should differ with different seeds');
        
    } catch (error) {
        errorLog(`Error testing seed behavior: ${error.message}`);
        if (error.response) {
            errorLog('Response status:', error.response.status);
            errorLog('Response data:', error.response.data);
        }
        t.fail(`Test failed with error: ${error.message}`);
    }
});

/**
 * Test: Seed behavior on /openai endpoint
 * 
 * Purpose: Verify that seeds continue to work on the /openai endpoint
 */
test('/openai endpoint should respect seed parameter', async t => {
    // Find a non-Cloudflare model that supports seed
    const nonCloudflareModels = availableModels.filter(m => 
        m.provider !== 'Cloudflare' && !m.name.includes('llama') && !m.name.includes('phi')
    );
    
    if (nonCloudflareModels.length === 0) {
        t.pass('No non-Cloudflare models available for testing');
        return;
    }
    
    const testModel = nonCloudflareModels[0];
    log(`Testing seed behavior with model: ${testModel.name}`);
    
    // Use the same seed for two identical requests
    const seed = 12345;
    const prompt = "Generate a random number between 1 and 1000";
    
    try {
        // First request with seed
        const firstResponse = await axiosInstance.post('/openai/chat/completions', {
            messages: [{ role: 'user', content: prompt }],
            model: testModel.name,
            seed: seed,
            cache: false
        });
        
        // Second request with the same seed
        const secondResponse = await axiosInstance.post('/openai/chat/completions', {
            messages: [{ role: 'user', content: prompt }],
            model: testModel.name,
            seed: seed,
            cache: false
        });
        
        // Get the response content from the OpenAI format
        const firstContent = firstResponse.data.choices[0].message.content;
        const secondContent = secondResponse.data.choices[0].message.content;
        
        // The responses should be identical when using the same seed
        t.is(firstContent, secondContent, 'Responses should be identical with the same seed');
        
        // Now use a different seed
        const differentSeed = seed + 1;
        const thirdResponse = await axiosInstance.post('/openai/chat/completions', {
            messages: [{ role: 'user', content: prompt }],
            model: testModel.name,
            seed: differentSeed,
            cache: false
        });
        
        const thirdContent = thirdResponse.data.choices[0].message.content;
        
        // The response with a different seed should be different
        t.not(firstContent, thirdContent, 'Responses should differ with different seeds');
        
    } catch (error) {
        errorLog(`Error testing seed behavior: ${error.message}`);
        if (error.response) {
            errorLog('Response status:', error.response.status);
            errorLog('Response data:', error.response.data);
        }
        t.fail(`Test failed with error: ${error.message}`);
    }
});

/**
 * Test: Seed handling for Cloudflare models
 * 
 * Purpose: Verify that seeds are properly removed for Cloudflare models
 * Note: This is more of an implementation test than a functional test
 */
test('Should remove seed parameter for Cloudflare models', async t => {
    // Find a Cloudflare model
    const cloudflareModels = availableModels.filter(m => 
        m.provider === 'Cloudflare' || m.name.includes('llama') || m.name.includes('phi')
    );
    
    if (cloudflareModels.length === 0) {
        t.pass('No Cloudflare models available for testing');
        return;
    }
    
    const testModel = cloudflareModels[0];
    log(`Testing seed handling with Cloudflare model: ${testModel.name}`);
    
    // Mock the actual API calls to just verify the request transformation
    // This is to avoid making actual API calls to Cloudflare
    const originalPrepareRequestParameters = app.prepareRequestParameters;
    
    try {
        // Override prepareRequestParameters to capture and inspect the transformed request
        let capturedParams = null;
        app.prepareRequestParameters = (params) => {
            capturedParams = { ...params };
            return originalPrepareRequestParameters(params);
        };
        
        // Make a request with a seed
        await axiosInstance.post('/', {
            messages: [{ role: 'user', content: 'Test prompt' }],
            model: testModel.name,
            seed: 12345,
            cache: false
        }).catch(err => {
            // We don't care about the actual response, just the request transformation
            log('Expected error or response:', err.message);
        });
        
        // Verify the seed was removed during request preparation
        t.is(capturedParams.seed, undefined, 'Seed should be removed for Cloudflare models');
        
    } catch (error) {
        errorLog(`Error testing Cloudflare seed handling: ${error.message}`);
        t.fail(`Test failed with error: ${error.message}`);
    } finally {
        // Restore the original function
        app.prepareRequestParameters = originalPrepareRequestParameters;
    }
});
