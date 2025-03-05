import test from 'ava';
import express from 'express';
import { setupTestServer } from './test-utils.js';
import app from '../server.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Configure higher timeout for all tests
test.beforeEach(t => {
    t.timeout(60000); // 60 seconds in milliseconds
});

// Setup test server once for all tests
let server, baseUrl, axiosInstance;

test.before(async () => {
    const setup = await setupTestServer(app);
    server = setup.server;
    baseUrl = setup.baseUrl;
    axiosInstance = setup.axiosInstance;
});

test.after.always(() => {
    if (server) server.close();
});

// Test function calling with tools parameter
test('Function calling - tools parameter is correctly passed through the proxy', async (t) => {
    // Mock response for the test
    const mockResponse = {
        id: 'mock-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                        {
                            id: 'call_123',
                            type: 'function',
                            function: {
                                name: 'get_weather',
                                arguments: '{"location":"Boston, MA","unit":"celsius"}'
                            }
                        }
                    ]
                },
                finish_reason: 'tool_calls'
            }
        ],
        usage: {
            prompt_tokens: 50,
            completion_tokens: 20,
            total_tokens: 70
        }
    };

    // Create a mock server that will respond to our request
    const mockApp = express();
    mockApp.post('/v1/chat/completions', (req, res) => {
        // Verify that the tools parameter is correctly passed through
        t.truthy(req.body.tools, 'Tools parameter should be present in the request');
        t.truthy(req.body.tool_choice, 'Tool choice parameter should be present in the request');
        
        // Check if the tools parameter has the correct structure
        t.is(req.body.tools.length, 1, 'Should have exactly one tool');
        t.is(req.body.tools[0].type, 'function', 'Tool type should be function');
        t.is(req.body.tools[0].function.name, 'get_weather', 'Function name should be get_weather');
        
        // Check if tool_choice is correctly passed
        t.is(req.body.tool_choice.type, 'function', 'Tool choice type should be function');
        t.is(req.body.tool_choice.function.name, 'get_weather', 'Tool choice function name should be get_weather');
        
        // Return the mock response
        res.json(mockResponse);
    });

    // Start the mock server
    const mockServer = await new Promise((resolve) => {
        const server = mockApp.listen(0, '127.0.0.1', () => {
            resolve(server);
        });
    });

    try {
        // Get the port of the mock server
        const mockPort = mockServer.address().port;
        
        // Save the original environment variables
        const originalEndpoint = process.env.OPENAI_API_ENDPOINT;
        const originalKey = process.env.OPENAI_API_KEY;
        
        // Set environment variables to point to our mock server
        process.env.OPENAI_API_ENDPOINT = `http://127.0.0.1:${mockPort}/v1/chat/completions`;
        process.env.OPENAI_API_KEY = 'mock-key';
        
        // Make a request to our proxy server with function calling parameters
        const response = await axiosInstance.post('/openai/chat/completions', {
            model: 'gpt-4',
            messages: [
                { role: 'user', content: 'What is the weather like in Boston?' }
            ],
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'get_weather',
                        description: 'Get the current weather in a given location',
                        parameters: {
                            type: 'object',
                            properties: {
                                location: {
                                    type: 'string',
                                    description: 'The city and state, e.g. San Francisco, CA'
                                },
                                unit: {
                                    type: 'string',
                                    enum: ['celsius', 'fahrenheit'],
                                    description: 'The temperature unit to use'
                                }
                            },
                            required: ['location', 'unit'],
                            additionalProperties: false
                        },
                        strict: true
                    }
                }
            ],
            tool_choice: { type: 'function', function: { name: 'get_weather' } }
        });
        
        // Verify the response
        t.is(response.status, 200, 'Response status should be 200');
        t.truthy(response.data.choices, 'Response should have choices');
        t.truthy(response.data.choices[0].message.tool_calls, 'Response should have tool_calls');
        t.is(response.data.choices[0].message.tool_calls[0].function.name, 'get_weather', 'Function name in response should be get_weather');
        
        // Restore original environment variables
        process.env.OPENAI_API_ENDPOINT = originalEndpoint;
        process.env.OPENAI_API_KEY = originalKey;
    } finally {
        // Close the mock server
        mockServer.close();
    }
});

// Test function calling with streaming
test('Function calling - streaming with tools parameter', async (t) => {
    // Create a mock server that will respond to our streaming request
    const mockApp = express();
    mockApp.post('/v1/chat/completions', (req, res) => {
        // Verify that the tools parameter is correctly passed through
        t.truthy(req.body.tools, 'Tools parameter should be present in the request');
        t.truthy(req.body.tool_choice, 'Tool choice parameter should be present in the request');
        t.true(req.body.stream, 'Stream parameter should be true');
        
        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // Send streaming response - just verify the request parameters
        // We don't need to test the actual streaming content since we're testing the proxy functionality
        res.write('data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
    });

    // Start the mock server
    const mockServer = await new Promise((resolve) => {
        const server = mockApp.listen(0, '127.0.0.1', () => {
            resolve(server);
        });
    });

    try {
        // Get the port of the mock server
        const mockPort = mockServer.address().port;
        
        // Save the original environment variables
        const originalEndpoint = process.env.OPENAI_API_ENDPOINT;
        const originalKey = process.env.OPENAI_API_KEY;
        
        // Set environment variables to point to our mock server
        process.env.OPENAI_API_ENDPOINT = `http://127.0.0.1:${mockPort}/v1/chat/completions`;
        process.env.OPENAI_API_KEY = 'mock-key';
        
        // Make a streaming request to our proxy server with function calling parameters
        const response = await axios.post(`${baseUrl}/openai/chat/completions`, {
            model: 'gpt-4',
            messages: [
                { role: 'user', content: 'What is the weather like in Boston?' }
            ],
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'get_weather',
                        description: 'Get the current weather in a given location',
                        parameters: {
                            type: 'object',
                            properties: {
                                location: {
                                    type: 'string',
                                    description: 'The city and state, e.g. San Francisco, CA'
                                },
                                unit: {
                                    type: 'string',
                                    enum: ['celsius', 'fahrenheit'],
                                    description: 'The temperature unit to use'
                                }
                            },
                            required: ['location', 'unit'],
                            additionalProperties: false
                        },
                        strict: true
                    }
                }
            ],
            tool_choice: { type: 'function', function: { name: 'get_weather' } },
            stream: true
        }, {
            responseType: 'stream'
        });
        
        // Verify the response is a stream
        t.is(response.status, 200, 'Response status should be 200');
        t.is(response.headers['content-type'], 'text/event-stream; charset=utf-8', 'Response content type should be SSE');
        
        // Collect and verify the stream data
        let streamData = '';
        await new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                streamData += chunk.toString();
            });
            
            response.data.on('end', () => {
                resolve();
            });
            
            response.data.on('error', (err) => {
                reject(err);
            });
        });
        
        // Verify stream data contains at least the basic SSE format
        t.true(streamData.includes('data:'), 'Stream should include data events');
        t.true(streamData.includes('[DONE]'), 'Stream should include completion marker');
        
        // Restore original environment variables
        process.env.OPENAI_API_ENDPOINT = originalEndpoint;
        process.env.OPENAI_API_KEY = originalKey;
    } finally {
        // Close the mock server
        mockServer.close();
    }
});
