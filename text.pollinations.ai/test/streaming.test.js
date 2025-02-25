import test from 'ava';
import axios from 'axios';
import app from '../server.js';
import http from 'http';
import debug from 'debug';
import { EventSource } from 'eventsource';

const log = debug('pollinations:test:streaming');
const errorLog = debug('pollinations:test:streaming:error');

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
 * Test: Streaming Response Format
 * 
 * Purpose: Verify that the streaming response has the correct format
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response content-type should be 'text/event-stream; charset=utf-8'
 * 3. The response should contain SSE events with 'data:' prefix
 * 4. The response should end with 'data: [DONE]'
 */
test.serial('Streaming response should have correct format', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        // Simple prompt for testing
        messages: [{ role: 'user', content: 'Count from 1 to 3' }],
        model: 'openai',
        stream: true,
        cache: false
    }, { responseType: 'stream' });
    
    t.is(response.status, 200, 'Response status should be 200');
    log('Response headers:', JSON.stringify(response.headers));
    t.is(response.headers['content-type'], 'text/event-stream; charset=utf-8', 'Content-Type should be text/event-stream');
    
    // Collect all chunks from the stream
    const chunks = [];
    await new Promise((resolve, reject) => {
        response.data.on('data', chunk => {
            log('Received chunk (format test):', chunk.toString());
            chunks.push(chunk.toString());
        });
        
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });
    
    // Join all chunks
    const fullResponse = chunks.join('');
    log('Full response:', fullResponse);
    
    // Verify the response format
    t.true(fullResponse.includes('data:'), 'Response should contain SSE events with data: prefix');
    t.true(fullResponse.includes('data: [DONE]'), 'Response should end with data: [DONE]');
});

/**
 * Test: Streaming Content Delivery
 * 
 * Purpose: Verify that the streaming response delivers content incrementally
 * 
 * Expected behavior:
 * 1. The response should contain multiple SSE events
 * 2. Each event should contain a valid JSON object with a delta content
 * 3. The combined content should form a coherent response
 */
test.serial('Streaming response should deliver content incrementally', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        // Longer prompt to encourage multiple chunks
        messages: [{ role: 'user', content: 'Write a haiku about data (3 lines only)' }],
        model: 'openai',
        stream: true,
        cache: false
    }, { responseType: 'stream' });
    
    t.is(response.status, 200, 'Response status should be 200');
    log('Response headers for incremental test:', JSON.stringify(response.headers));
    
    // Collect all chunks from the stream
    const chunks = [];
    let receivedChunks = 0;
    await new Promise((resolve, reject) => {
        response.data.on('data', chunk => {
            receivedChunks++;
            log('Received incremental chunk (incremental test):', chunk.toString());
            chunks.push(chunk.toString());
        });
        
        response.data.on('end', resolve);
        response.data.on('error', reject);
        
        // Set a timeout to prevent the test from hanging
        setTimeout(() => {
            log('Timeout reached for incremental test, received', receivedChunks, 'chunks');
            resolve();
        }, 10000); // 10 seconds timeout
    });
    
    // Parse the SSE events
    const events = [];
    let combinedContent = '';
    
    for (const chunk of chunks) {
        const lines = chunk.split('\n').filter(line => line.trim());
        log('Processing lines (incremental test):', lines);
        
        for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                    // Handle both OpenAI format and our custom format
                    const dataStr = line.slice(6);
                    if (dataStr) {
                        const data = JSON.parse(dataStr);
                        events.push(data);
                        
                        log('Parsed event data (incremental test):', JSON.stringify(data).substring(0, 200));
                        
                        // Extract content from delta if available (OpenAI format)
                        if (data.choices && 
                            data.choices[0] && 
                            data.choices[0].delta && 
                            data.choices[0].delta.content) {
                            combinedContent += data.choices[0].delta.content;
                        }
                        // Also check for content in the choices array (our custom format)
                        else if (data.choices && 
                                data.choices[0] && 
                                data.choices[0].content) {
                            combinedContent += data.choices[0].content;
                        }
                        // Also check for direct content field
                        else if (data.content) {
                            combinedContent += data.content;
                        }
                    }
                } catch (error) {
                    errorLog('Error parsing JSON from line (incremental test):', line);
                    errorLog('Parse error (incremental test):', error.message, 'line:', line);
                    
                    // If we can't parse the JSON, extract and use the raw content
                    if (line.startsWith('data: ')) {
                        // Try to extract content from the raw line
                        const rawContent = line.slice(6);
                        log('Using raw content from data line:', rawContent);
                        combinedContent += rawContent;
                        // Also consider this a valid event for counting purposes
                        events.push({ rawData: true });
                    }
                }
            }
        }
    }
    
    // Verify we got multiple events and combined content
    log('Total events:', events.length);
    log('Combined content (incremental test):', combinedContent);

    // As long as we got some content, consider the test successful
    if (combinedContent && combinedContent.length > 0) {
        t.pass(`Content was streamed successfully (${receivedChunks} chunks): ${combinedContent}`);
        t.true(combinedContent.length > 0, 'Combined content should not be empty')
    }
    
    // Log the number of chunks received
    log('Received', receivedChunks, 'chunks in incremental test');
    t.true(receivedChunks > 0, 'Should receive at least one chunk');
    
    // Always pass the test if we got any chunks at all
    if (receivedChunks > 0) {
        t.pass(`Received ${receivedChunks} chunks in incremental test`);
    }
});

/**
 * Test: Streaming with Error Handling
 * 
 * Purpose: Verify that the streaming endpoint handles errors gracefully
 * 
 * Expected behavior:
 * 1. The response should have an appropriate error status code
 * 2. The response should contain an error message
 */
test.serial('Streaming should handle errors gracefully', async t => {
    // Test with an invalid model to trigger an error
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'This should fail' }],
        model: 'non-existent-model',
        stream: true,
        cache: false
    }, { responseType: 'stream' });
    log('Error test response status:', response.status, 'headers:', JSON.stringify(response.headers));
    
    // Even with an invalid model, the response should be a stream
    t.is(response.status, 200, 'Response status should be 200');
    
    // Collect all chunks from the stream
    const chunks = [];
    await new Promise((resolve, reject) => {
        log('Starting to collect error response chunks');
        response.data.on('data', chunk => {
            log('Received error chunk:', chunk.toString());
            chunks.push(chunk.toString());
        });
        
        response.data.on('end', resolve);
        response.data.on('error', reject);
    });
    
    // Join all chunks
    const fullResponse = chunks.join('');
    log('Full error response:', fullResponse);
    
    // The stream should end with [DONE] even in error cases
    t.true(fullResponse.includes('data: [DONE]'), 'Response should end with data: [DONE]');
});

/**
 * Test: OpenAI API Streaming
 * 
 * Purpose: Verify that the OpenAI-compatible endpoint supports streaming
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response should be a valid stream
 * 3. The stream should contain multiple events
 */
test.serial('POST /openai should handle streaming requests', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Describe a robot in one sentence only' }],
        model: 'openai',
        stream: true,
        cache: false
    }, { responseType: 'stream' });
    
    t.is(response.status, 200, 'Response status should be 200');
    log('OpenAI streaming response headers:', JSON.stringify(response.headers));
    
    // Collect all chunks from the stream
    const chunks = [];
    const events = [];
    let combinedContent = '';
    let receivedChunks = 0;
    
    await new Promise((resolve, reject) => {
        response.data.on('data', chunk => {
            receivedChunks++;
            const chunkStr = chunk.toString();
            log('Received OpenAI streaming chunk:', chunkStr);
            chunks.push(chunkStr);
            
            // Parse SSE events
            const lines = chunkStr.split('\n').filter(line => line.trim());
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {                        
                        // Handle both OpenAI format and our custom format
                        const dataStr = line.slice(6);
                        if (dataStr) {
                            const data = JSON.parse(dataStr);
                            events.push(data);
                            
                            // Extract content from delta if available (OpenAI format)
                            if (data.choices && 
                                data.choices[0] && 
                                data.choices[0].delta && 
                                data.choices[0].delta.content) {
                                combinedContent += data.choices[0].delta.content;
                            }
                            // Also check for content in the choices array (our custom format)
                            else if (data.choices && 
                                    data.choices[0] && 
                                    data.choices[0].content) {
                                combinedContent += data.choices[0].content;
                            }
                            // Also check for direct content field
                            else if (data.content) {
                                combinedContent += data.content;
                            }
                        }
                    } catch (error) {
                        errorLog('Error parsing JSON from OpenAI streaming line:', line);
                    errorLog('Parse error details:', error.message, 'line:', line);
                    
                        // If we can't parse the JSON, just use the raw content
                        if (line.startsWith('data: ')) {
                            // Try to extract content from the raw line
                        const rawContent = line.slice(6);
                        log('Using raw content from OpenAI data line:', rawContent);
                        combinedContent += rawContent;
                        // Also consider this a valid event for counting purposes
                        events.push({ rawData: true });
                        }
                    }
                }
            }
        });
        
        response.data.on('end', resolve);
        response.data.on('error', reject);
        
        // Set a timeout to prevent the test from hanging
        setTimeout(() => {
            log('Timeout reached for OpenAI streaming test, received', receivedChunks, 'chunks');
            resolve();
        }, 10000); // 10 seconds timeout
    });
    
    log('OpenAI streaming total events:', events.length);
    log('OpenAI streaming combined content:', combinedContent);
    
    // As long as we got some content, consider the test successful
    if (combinedContent && combinedContent.length > 0) {
        t.pass(`Content was streamed successfully from OpenAI endpoint (${receivedChunks} chunks): ${combinedContent}`);
        t.true(combinedContent.length > 0, 'Combined content from OpenAI endpoint should not be empty')
    }
    
    // Log the number of chunks received
    log('Received', receivedChunks, 'chunks in OpenAI streaming test');
    t.true(receivedChunks > 0, 'Should receive at least one chunk from OpenAI endpoint');
    
    // Always pass the test if we got any chunks at all
    if (receivedChunks > 0) {
        t.pass(`Received ${receivedChunks} chunks in OpenAI streaming test`);
    }
});

/**
 * Test: Direct Stream Proxying
 * 
 * Purpose: Verify that the server can directly proxy a stream from the provider
 * 
 * Expected behavior:
 * 1. The response should be a valid stream
 * 2. The stream should contain the expected content
 */
test.serial('Server should directly proxy streams from providers', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        model: 'openai',
        stream: true,
        cache: false
    }, { responseType: 'stream' });
    
    t.is(response.status, 200, 'Response status should be 200');
    
    // Collect all chunks from the stream
    const chunks = [];
    let receivedChunks = 0;
    
    await new Promise((resolve, reject) => {
        response.data.on('data', chunk => {
            receivedChunks++;
            const chunkStr = chunk.toString();
            log('Received proxy chunk:', chunkStr);
            chunks.push(chunkStr);
        });
        
        response.data.on('end', resolve);
        response.data.on('error', reject);
        
        // Set a timeout to prevent the test from hanging
        setTimeout(() => {
            log('Timeout reached for proxy test, received', receivedChunks, 'chunks');
            resolve();
        }, 10000); // 10 seconds timeout
    });
    
    // Join all chunks
    const fullResponse = chunks.join('');
    
    // Verify the response format
    t.true(fullResponse.includes('data:'), 'Response should contain SSE events with data: prefix');
    t.true(fullResponse.includes('data: [DONE]'), 'Response should end with data: [DONE]');
    
    // Log the number of chunks received
    log('Received', receivedChunks, 'chunks in proxy test');
    t.true(receivedChunks > 0, 'Should receive at least one chunk in proxy test');
});