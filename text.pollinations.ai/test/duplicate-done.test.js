import test from 'ava';
import axios from 'axios';
import app from '../server.js';
import http from 'http';
import debug from 'debug';

const log = debug('pollinations:test:duplicate-done');
const errorLog = debug('pollinations:test:duplicate-done:error');

// Configure higher timeout for all tests
test.beforeEach(t => {
    t.timeout(60000); // 60 seconds in milliseconds
});

let server;
let baseUrl;
let axiosInstance;

// Start local server before tests
test.before(async t => {
    await new Promise((resolve, reject) => {
        server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            baseUrl = `http://127.0.0.1:${address.port}`;
            log(`Test server started at ${baseUrl}`);
            // Create axios instance with base URL
            axiosInstance = axios.create({
                baseURL: baseUrl,
                validateStatus: status => true, // Don't throw on any status
                headers: {
                    'Referer': 'roblox'
                },
                params: {
                    code: 'BeesKnees'
                }
            });
            resolve();
        });
        server.on('error', reject);
    });
});

// Clean up server after tests
test.after.always(t => {
    if (server) {
        server.close();
    }
});

/**
 * Test: Check for Duplicate [DONE] Events
 * 
 * Purpose: Verify that the streaming response only contains a single [DONE] event
 * 
 * Expected behavior:
 * 1. The response should contain exactly one 'data: [DONE]' event
 */
test.serial('Streaming response should have exactly one [DONE] event', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Write a short sentence about testing' }],
        model: 'openai',
        stream: true,
        cache: false
    }, { responseType: 'stream' });
    
    t.is(response.status, 200, 'Response status should be 200');
    
    // Collect all chunks from the stream
    const chunks = [];
    await new Promise((resolve) => {
        response.data.on('data', (chunk) => {
            const chunkStr = chunk.toString();
            log('Received chunk:', chunkStr);
            chunks.push(chunkStr);
        });
        
        response.data.on('end', resolve);
    });
    
    // Join all chunks
    const fullResponse = chunks.join('');
    
    // Count the number of [DONE] events
    const doneCount = (fullResponse.match(/data: \[DONE\]/g) || []).length;
    
    log(`Found ${doneCount} [DONE] events in the response`);
    
    // Verify there is exactly one [DONE] event
    t.is(doneCount, 1, 'Response should contain exactly one [DONE] event');
});

/**
 * Test: Check for Duplicate [DONE] Events with Azure OpenAI via Portkey
 * 
 * Purpose: Verify that the streaming response from Azure OpenAI via Portkey only contains a single [DONE] event
 * 
 * Expected behavior:
 * 1. The response should contain exactly one 'data: [DONE]' event
 */
test.serial('Azure OpenAI via Portkey streaming should have exactly one [DONE] event', async t => {
    // Skip this test if Azure OpenAI is not configured
    if (!process.env.AZURE_OPENAI_API_KEY) {
        t.pass('Skipping test because AZURE_OPENAI_API_KEY is not set');
        return;
    }
    
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Write a short sentence about cloud computing' }],
        model: 'openai', // This should map to Azure OpenAI via Portkey
        stream: true,
        cache: false
    }, { responseType: 'stream' });
    
    t.is(response.status, 200, 'Response status should be 200');
    
    // Collect all chunks from the stream
    const chunks = [];
    await new Promise((resolve) => {
        response.data.on('data', (chunk) => {
            const chunkStr = chunk.toString();
            log('Received chunk from Azure OpenAI via Portkey:', chunkStr);
            chunks.push(chunkStr);
        });
        
        response.data.on('end', resolve);
    });
    
    // Join all chunks
    const fullResponse = chunks.join('');
    
    // Count the number of [DONE] events
    const doneCount = (fullResponse.match(/data: \[DONE\]/g) || []).length;
    
    log(`Found ${doneCount} [DONE] events in the Azure OpenAI via Portkey response`);
    
    // Verify there is exactly one [DONE] event
    t.is(doneCount, 1, 'Response should contain exactly one [DONE] event');
});
