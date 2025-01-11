import test from 'ava';
import axios from 'axios';
import { availableModels } from '../availableModels.js';
import app from '../server.js';
import http from 'http';

// Configure higher timeout for all tests (5 minutes)
test.beforeEach(t => {
    t.timeout(40000); // 5 minutes in milliseconds
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
            console.log(`Test server started at ${baseUrl}`);
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

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

// Add cleanup hook
test.afterEach.always(t => {
    // Close any potential event streams
    if (global.EventSource) {
        const sources = Object.values(global.EventSource.instances || {});
        sources.forEach(source => source.close());
    }
});

/**
 * Generates a random seed for consistent but varied responses.
 * @returns {number} A random integer between 0 and 999999.
 */
function generateRandomSeed() {
    return Math.floor(Math.random() * 1000000);
}

/**
 * Test: GET /models
 * 
 * Purpose: Verify that the /models endpoint returns a list of available models.
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK).
 * 2. The response body should be an array.
 * 3. The array should contain at least one model.
 */
test('GET /models should return models', async t => {
    const response = await axiosInstance.get('/models');
    t.is(response.status, 200, 'Response status should be 200');
    t.true(Array.isArray(response.data), 'Response body should be an array');
    t.true(response.data.length > 0, 'Array should contain at least one model');
});

/**
 * Test Suite: Individual Model Tests
 * 
 * Purpose: Verify that each available model responds correctly to a test prompt.
 * 
 * For each model:
 * 1. Sends a POST request with a test prompt.
 * 2. Uses a random seed for consistent but varied responses.
 * 3. Disables caching to ensure a fresh response.
 * 
 * Expected behavior for each model:
 * 1. The response status should be 200 (OK).
 * 2. The response should contain data.
 * 
 * Note: If a model fails, the error is logged and re-thrown to fail the test.
 */
availableModels.forEach(model => {
    test(`should return correct response for ${model.name}`, async t => {
        try {
            const seed = generateRandomSeed();
            const response = await axiosInstance.post('/', {
                messages: [{ role: 'user', content: 'Test prompt for model' }],
                model: model.name,
                seed,
                cache: false
            });
            t.is(response.status, 200, `Response status for ${model.name} should be 200`);
            t.truthy(response.data, `Response for ${model.name} should contain data`);
        } catch (error) {
            // Only log the error message and status, not the full error object
            console.error(`Model ${model.name} failed with error:`, error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', error.response.data);
            }
            t.fail(`Model ${model.name} test failed: ${error.message}`);
        }
    });
});

/**
 * Test: Error Handling
 * 
 * Purpose: Verify that the API handles errors appropriately.
 */
test('should handle errors gracefully', async t => {
    const response = await fetch(`http://localhost:${server.address().port}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messages: 'invalid'
        })
    });
    
    t.is(response.status, 400, 'Response status should be 400');
    const errorText = await response.text();
    t.is(errorText, 'Invalid messages array. Received: invalid', 'Error message should indicate invalid messages');
});

/**
 * Test: Seed Consistency
 * 
 * Purpose: Verify that different seeds produce different responses for the same prompt.
 * 
 * Steps:
 * 1. Send multiple POST requests with the same prompt but different random seeds.
 * 2. Disable caching to ensure fresh responses.
 * 
 * Expected behavior:
 * 1. All responses should have status 200 (OK).
 * 2. Responses for different seeds should be different from each other.
 */
test('should return different responses for different seeds', async t => {
    const messages = [{ role: 'user', content: 'Hello, how are you today? Write me a short poem' }];
    const numSeeds = 3; // Number of seeds to test
    const responses = [];

    for (let i = 0; i < numSeeds; i++) {
        const seed = generateRandomSeed();
        const response = await axiosInstance.post('/', { messages, seed, cache: false });
        t.is(response.status, 200, `Response ${i + 1} status should be 200`);
        responses.push(response.data);
    }

    // Compare responses to ensure they are different for different seeds
    for (let i = 1; i < numSeeds; i++) {
        t.notDeepEqual(responses[i], responses[0], `Response ${i + 1} should be different from response 1`);
    }
});

/**
 * Test: JSON Mode
 * 
 * Purpose: Verify that the API returns a valid JSON response when jsonMode is enabled.
 * 
 * Steps:
 * 1. Send a POST request with jsonMode set to true.
 * 2. Request a JSON object with specific keys.
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK).
 * 2. The response should be a valid JSON object with the requested keys.
 */
test('should return JSON response when jsonMode is true', async t => {
    const response = await axiosInstance.post('/', {
        messages: [{ role: 'user', content: 'Return a JSON object with keys "name" and "age"' }],
        jsonMode: true,
        cache: false
    });
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.data, 'Response should contain data');
    t.truthy(response.data.name, 'Response should contain a "name" key');
    t.truthy(response.data.age, 'Response should contain an "age" key');
});

/**
 * Test: Temperature Parameter
 * 
 * Purpose: Verify that the temperature parameter affects the creativity of responses.
 * 
 * Steps:
 * 1. Send two POST requests with the same prompt but different temperature values.
 * 2. Use a low temperature (0.1) for one request and a high temperature (1.0) for the other.
 * 
 * Expected behavior:
 * 1. Both responses should have status 200 (OK).
 * 2. The responses should be different from each other, indicating the effect of temperature.
 */
test('should respect temperature parameter', async t => {
    const lowTempResponse = await axiosInstance.post('/', {
        messages: [{ role: 'user', content: 'Write a creative story' }],
        temperature: 0.1,
        cache: false
    });
    const highTempResponse = await axiosInstance.post('/', {
        messages: [{ role: 'user', content: 'Write a creative story' }],
        temperature: 1.0,
        cache: false
    });
    t.is(lowTempResponse.status, 200, 'Low temperature response status should be 200');
    t.is(highTempResponse.status, 200, 'High temperature response status should be 200');
    t.notDeepEqual(lowTempResponse.data, highTempResponse.data, 'Responses should differ based on temperature');
});

/**
 * Test: System Message Handling
 * 
 * Purpose: Verify that the API correctly handles and respects system messages.
 * 
 * Steps:
 * 1. Send a POST request with a system message defining the AI's behavior.
 * 2. Follow with a user message to trigger the defined behavior.
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK).
 * 2. The response should reflect the behavior defined in the system message.
 */
test('should handle system messages correctly', async t => {
    const response = await axiosInstance.post('/', {
        messages: [
            { role: 'system', content: 'You are a helpful assistant who greets with the word "ahoy".' },
            { role: 'user', content: 'Greet me' }
        ],
        cache: false
    });
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.data.toLowerCase().includes('ahoy'), 'Response should include the word "ahoy"');
});

/**
 * Test: OpenAI Format Compatibility
 * 
 * Purpose: Verify that the API's OpenAI-compatible endpoint returns responses in the correct format.
 * 
 * Steps:
 * 1. Send a POST request to the OpenAI-compatible endpoint.
 * 2. Use a simple greeting as the user message.
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK).
 * 2. The response should have a structure compatible with OpenAI's format, including 'choices' and 'message' fields.
 */
test('POST /openai should return OpenAI-compatible format', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'openai',
        cache: false
    });
    console.log("rrrr",response.data.choices);
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.data.choices, 'Response should contain a "choices" array');
    t.truthy(response.data.choices[0].message, 'First choice should have a "message" object');
    t.truthy(response.data.choices[0].message.content, 'Message should have a "content" field');
});

/**
 * Test: OpenAI API should handle invalid model gracefully
 * 
 * Purpose: Verify that the API handles invalid model input gracefully.
 * 
 * Steps:
 * 1. Send a POST request to the OpenAI-compatible endpoint with an invalid model.
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK).
 * 2. The response should contain a "choices" array.
 * 3. The first choice should have a "message" object.
 */
test('OpenAI API should handle invalid model gracefully', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'non-existent-model',
        cache: false
    });
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.data.choices, 'Response should contain a "choices" array');
    t.truthy(response.data.choices[0].message, 'First choice should have a "message" object');
});

/**
 * Test: Function Calling Support
 * 
 * Purpose: Verify that the API supports function calling while maintaining searchgpt compatibility
 */
test('should support basic function calling', async t => {
    const tools = [{
        type: "function",
        function: {
            name: "get_current_weather",
            description: "Get the current weather in a given location",
            parameters: {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description: "The city and state, e.g. San Francisco, CA"
                    },
                    unit: {
                        type: "string",
                        enum: ["celsius", "fahrenheit"]
                    }
                },
                required: ["location"],
                additionalProperties: false
            }
        }
    }];

    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: "What's the weather like in San Francisco?" }],
        model: 'openai',
        tools,
        cache: false
    });

    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.data.choices[0].message.tool_calls, 'Response should include tool calls');
    const toolCall = response.data.choices[0].message.tool_calls[0];
    t.is(toolCall.function.name, 'get_current_weather', 'Should call the weather function');
    
    const args = JSON.parse(toolCall.function.arguments);
    t.is(args.location, 'San Francisco', 'Should extract correct location');
});

/**
 * Test: SearchGPT Compatibility
 * 
 * Purpose: Verify that searchgpt functionality remains intact when function calling is enabled
 */
test('should maintain searchgpt functionality with function calling', async t => {
    // First test regular function calling
    const customTools = [{
        type: "function",
        function: {
            name: "custom_function",
            description: "A custom function",
            parameters: {
                type: "object",
                properties: {
                    param: { type: "string" }
                },
                required: ["param"],
                additionalProperties: false
            }
        }
    }];

    const regularResponse = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: "Call the custom function with 'test'" }],
        model: 'openai',
        tools: customTools,
        cache: false
    });

    t.is(regularResponse.status, 200, 'Regular function call response status should be 200');
    t.truthy(regularResponse.data.choices[0].message.tool_calls, 'Should include custom tool calls');

    // Then test searchgpt
    const searchResponse = await axiosInstance.post('/', {
        messages: [{ role: 'user', content: "What's the latest news about AI?" }],
        model: 'searchgpt',
        cache: false
    });

    t.is(searchResponse.status, 200, 'SearchGPT response status should be 200');
    const content = searchResponse.data;
    t.truthy(content.includes('search') || content.includes('found'), 'Response should indicate search was performed');
});

/**
 * Test: Function Calling with Streaming
 * 
 * Purpose: Verify that function calling works with streaming responses
 */
test('should support function calling with streaming', async t => {
    const tools = [{
        type: "function",
        function: {
            name: "get_current_weather",
            description: "Get the current weather",
            parameters: {
                type: "object",
                properties: {
                    location: { type: "string" }
                },
                required: ["location"],
                additionalProperties: false
            }
        }
    }];

    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: "What's the weather in Paris?" }],
        model: 'openai',
        tools,
        stream: true,
        cache: false
    });

    t.is(response.status, 200, 'Response status should be 200');
    t.is(response.headers['content-type'], 'text/event-stream; charset=utf-8', 'Should use SSE content type');
});

/**
 * Test: Streaming Responses (Commented Out)
 *
 * Purpose: Verify that the API supports streaming responses for the OpenAI-compatible endpoint.
 *
 * Note: This test is currently commented out, likely due to challenges in testing streaming responses.
 * Consider implementing this test if a reliable method for testing SSE in your environment is available.
 *
 * Expected behavior (when implemented):
 * 1. The response status should be 200 (OK).
 * 2. The response content-type should be 'text/event-stream; charset=utf-8'.
 */
test('POST /openai should support streaming', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [{ role: 'user', content: 'Count to 5' }],
        model: 'gpt-4',
        stream: true,
        cache: false
    }, { responseType: 'stream' });
    t.is(response.status, 200, 'Response status should be 200');
    t.is(response.headers['content-type'], 'text/event-stream; charset=utf-8', 'Content-Type should be text/event-stream');
});

/**
 * Test: Basic Function Calling
 * 
 * Purpose: Verify that the API supports basic function calling with a single function
 * 
 * Steps:
 * 1. Define a simple calculator function
 * 2. Send a request that should trigger the function
 * 3. Verify the response includes function call and final result
 */
test('should support basic function calling', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [
            { role: 'user', content: 'What is 25 plus 17?' }
        ],
        functions: [{
            name: 'calculate',
            description: 'Calculate basic math operations',
            parameters: {
                type: 'object',
                properties: {
                    operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
                    a: { type: 'number' },
                    b: { type: 'number' }
                },
                required: ['operation', 'a', 'b']
            }
        }],
        cache: false
    });

    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.data.choices[0].message.function_call, 'Response should include function call');
    t.is(response.data.choices[0].message.function_call.name, 'calculate', 'Function call should be for calculate function');
    
    const args = JSON.parse(response.data.choices[0].message.function_call.arguments);
    t.is(args.operation, 'add', 'Operation should be add');
    t.is(args.a, 25, 'First number should be 25');
    t.is(args.b, 17, 'Second number should be 17');
});

/**
 * Test: Multiple Function Calls
 * 
 * Purpose: Verify that the API supports multiple function calls in sequence
 * 
 * Steps:
 * 1. Define multiple functions (search and scrape)
 * 2. Send a request that requires multiple function calls
 * 3. Verify the response includes all function calls and final result
 */
test('should support multiple function calls in sequence', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [
            { role: 'user', content: 'Search for the latest news about AI and summarize the first article you find' }
        ],
        functions: [
            {
                name: 'web_search',
                description: 'Search the web for information',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'web_scrape',
                description: 'Scrape content from a webpage',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string' }
                    },
                    required: ['url']
                }
            }
        ],
        cache: false
    });

    t.is(response.status, 200, 'Response status should be 200');
    
    // First function call should be web_search
    const firstCall = response.data.choices[0].message.function_call;
    t.is(firstCall.name, 'web_search', 'First function call should be web_search');
    t.truthy(JSON.parse(firstCall.arguments).query, 'Search query should be present');
    
    // Subsequent messages should include web_scrape call
    t.truthy(response.data.choices[0].message.content.includes('web_scrape'), 'Response should include web scrape results');
});

/**
 * Test: Function Call Error Handling
 * 
 * Purpose: Verify that the API handles function call errors gracefully
 * 
 * Steps:
 * 1. Send a request with invalid function parameters
 * 2. Verify the error response format
 */
test('should handle function call errors gracefully', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [
            { role: 'user', content: 'Calculate 25 divided by 0' }
        ],
        functions: [{
            name: 'calculate',
            description: 'Calculate basic math operations',
            parameters: {
                type: 'object',
                properties: {
                    operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
                    a: { type: 'number' },
                    b: { type: 'number' }
                },
                required: ['operation', 'a', 'b']
            }
        }],
        cache: false
    });

    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.data.choices[0].message.content.includes('error'), 'Response should include error message');
    t.falsy(response.data.choices[0].message.function_call, 'Should not attempt function call with invalid input');
});

/**
 * Test: Function Call with Streaming
 * 
 * Purpose: Verify that function calling works with streaming responses
 * 
 * Steps:
 * 1. Send a request with function calling and streaming enabled
 * 2. Verify the streaming response format includes function calls
 */
test('should support function calling with streaming', async t => {
    const response = await axiosInstance.post('/openai/chat/completions', {
        messages: [
            { role: 'user', content: 'What is 42 plus 17?' }
        ],
        functions: [{
            name: 'calculate',
            description: 'Calculate basic math operations',
            parameters: {
                type: 'object',
                properties: {
                    operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
                    a: { type: 'number' },
                    b: { type: 'number' }
                },
                required: ['operation', 'a', 'b']
            }
        }],
        stream: true,
        cache: false
    }, { responseType: 'stream' });

    t.is(response.status, 200, 'Response status should be 200');
    t.is(response.headers['content-type'], 'text/event-stream; charset=utf-8', 'Content-Type should be text/event-stream');
});
