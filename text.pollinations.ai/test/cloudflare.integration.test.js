import test from 'ava';
import axios from 'axios';
import app from '../server.js';
import http from 'http';
import debug from 'debug';

const log = debug('pollinations:test:cloudflare');
const errorLog = debug('pollinations:test:cloudflare:error');

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
                    'Referer': 'test'
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
 * Test: Cloudflare API Error Handling
 * 
 * Purpose: Verify that API errors are properly handled and not streamed
 * 
 * Expected behavior:
 * 1. Error response should have a non-200 status code
 * 2. Error response should contain error details
 */
test('Cloudflare API errors should be returned as proper error responses, not streamed', async t => {
    // Using a request with a seed parameter to trigger the Cloudflare API error
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Hello, this should fail with a seed mismatch' }],
        model: 'llama',
        stream: true,
        cache: false,
        seed: 42 // This will be rejected by Cloudflare
    });
    
    // The error should be returned as a non-200 response
    t.not(response.status, 200, 'Response status should not be 200');
    t.true(response.status >= 400, 'Response status should be an error code (400+)');
    
    // The response should contain error information
    t.truthy(response.data.error, 'Response should contain error information');
    t.regex(response.data.error, /Cloudflare API error|responseHeaders|API error/i, 'Error should mention API error');
});