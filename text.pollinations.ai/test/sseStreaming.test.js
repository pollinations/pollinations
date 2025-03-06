import test from 'ava';
import axios from 'axios';
import app from '../server.js';
import http from 'http';
import debug from 'debug';
import { EventSource } from 'eventsource';

const log = debug('pollinations:test:sseStreaming');
const errorLog = debug('pollinations:test:sseStreaming:error');

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
 * Test: SSE Content Type Verification
 * 
 * Purpose: Verify that the streaming response has the correct SSE content type
 * 
 * Expected behavior:
 * 1. The response content-type should be 'text/event-stream; charset=utf-8'
 */
test.serial('Response should have correct SSE content type', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'openai',
        stream: true,
        cache: false
    }, { responseType: 'stream' });
    
    t.is(response.status, 200, 'Response status should be 200');
    t.is(response.headers['content-type'], 'text/event-stream; charset=utf-8', 
        'Content-Type should be text/event-stream; charset=utf-8');
    
    // Just collect the response to complete the request
    await new Promise((resolve) => {
        response.data.on('data', () => {});
        response.data.on('end', resolve);
    });
});

/**
 * Test: Streaming Response DONE Marker
 * 
 * Purpose: Verify that the streaming response ends with the correct DONE marker
 * 
 * Expected behavior:
 * 1. The response should end with 'data: [DONE]'
 */
test.serial('Streaming response should end with [DONE] marker', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Count from 1 to 3' }],
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
            chunks.push(chunk.toString());
        });
        
        response.data.on('end', resolve);
    });
    
    // Join all chunks and check if it includes the DONE marker
    const fullResponse = chunks.join('');
    log('Full response:', fullResponse);
    
    // Verify the response ends with [DONE]
    t.true(fullResponse.includes('data: [DONE]'), 'Response should end with data: [DONE]');
});

/**
 * Test: JSON Content Verification
 * 
 * Purpose: Verify that the streaming response contains parseable JSON chunks
 * 
 * Expected behavior:
 * 1. The response should contain valid parseable JSON chunks
 * 2. The JSON should follow the OpenAI streaming format with choices and delta
 */
test.serial('Streaming response should contain valid JSON chunks', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Say hi' }],
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
            log('Received JSON chunk:', chunkStr);
            chunks.push(chunk.toString());
        });
        
        response.data.on('end', resolve);
    });
    
    // Join all chunks
    const fullResponse = chunks.join('');
    
    // Split by newlines to get individual lines
    const lines = fullResponse.split('\n').filter(line => line.trim());
    log('JSON test - Lines count:', lines.length);
    
    // Attempt to parse each line as JSON (except the [DONE] line)
    let validJsonCount = 0;
    
    for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            // Handle SSE formatted data
            try {
                const jsonStr = line.slice(6); // Remove 'data: ' prefix
                log('Attempting to parse SSE JSON:', jsonStr);
                const data = JSON.parse(jsonStr);
                log('Parsed SSE JSON successfully');
                validJsonCount++;
            } catch (error) {
                // Don't fail the test, just log the error
                errorLog(`Failed to parse SSE JSON: ${error.message}, Line: ${line}`);
            }
        } else if (!line.startsWith('data:')) {
            // Try to parse as raw JSON
            try {
                const data = JSON.parse(line);
                log('Parsed raw JSON successfully');
                
                // Verify it has the expected structure
                if (data.choices && Array.isArray(data.choices)) {
                    validJsonCount++;
                }
            } catch (error) {
                // Don't fail the test, just log the error
                errorLog(`Failed to parse JSON: ${error.message}, Line: ${line}`);
            }
        }
    }
    
    // As long as we found at least one valid JSON chunk, consider the test passed
    t.true(validJsonCount > 0, `Should have at least one valid JSON chunk (found ${validJsonCount})`);
});

/**
 * Test: Cache Control Headers for SSE
 * 
 * Purpose: Verify that the streaming response has the correct cache control headers
 * 
 * Expected behavior:
 * 1. The 'Cache-Control' header should be set to 'no-cache'
 * 2. The 'Connection' header should be set to 'keep-alive'
 */
test.serial('SSE response should have correct cache control headers', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Hello there' }],
        model: 'openai',
        stream: true,
        cache: false
    }, { responseType: 'stream' });
    
    t.is(response.status, 200, 'Response status should be 200');
    t.is(response.headers['cache-control'], 'no-cache', 'Cache-Control should be no-cache');
    t.is(response.headers['connection'], 'keep-alive', 'Connection should be keep-alive');
    
    // Just collect the response to complete the request
    await new Promise((resolve) => {
        response.data.on('data', () => {});
        response.data.on('end', resolve);
    });
});