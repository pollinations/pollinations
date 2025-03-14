import test from 'ava';
import axios from 'axios';
import app from '../server.js';
import debug from 'debug';
import { availableModels } from '../availableModels.js';
import { setupTestServer, generateRandomSeed } from './test-utils.js';

const log = debug('pollinations:test');
const errorLog = debug('pollinations:test:error');

// Configure higher timeout for all tests
test.beforeEach(t => {
    t.timeout(40000); // 40 seconds in milliseconds
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

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    errorLog('Unhandled Rejection at:', promise, 'reason:', reason);
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
 * Test: Error Handling
 * 
 * Purpose: Verify that the API handles errors appropriately.
 */
test('should handle errors gracefully', async t => {
    const response = await axiosInstance.post('/', {
        messages: 'invalid'
    }, {
        validateStatus: status => true // Don't throw on any status code
    });
    
    t.is(response.status, 400, 'Response status should be 400');
    t.is(response.data.error, 'Invalid messages array', 'Error message should indicate invalid messages');
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
        messages: [{ role: 'user', content: 'Generate a JSON object with exactly two top-level keys: "name" (a real name string) and "age" (a number between 1 and 100). Do not nest these under any other object.' }],
        jsonMode: true,
        cache: false
    });
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.data, 'Response should contain data');
    t.truthy(response.data.name, 'Response should contain a "name" key');
    t.truthy(response.data.age, 'Response should contain an "age" key');
    t.true(typeof response.data.age === 'number', 'Age should be a number');
    t.true(response.data.age > 0 && response.data.age <= 100, 'Age should be between 1 and 100');
    t.true(response.data.name.length > 0, 'Name should not be empty');
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
    log('OpenAI response choices: %O', response.data.choices);
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
 * Test Suite: Special Character Handling
 * 
 * Purpose: Verify that the API properly handles various types of special characters
 * and potentially dangerous input
 */
test('POST /openai should handle special characters', async t => {
    const testCases = [
        {
            content: '🌟 Hello World! 🌍',
            description: 'Emojis'
        },
        {
            content: '안녕하세요 नमस्ते Здравствуйте',
            description: 'Unicode characters'
        },
        {
            content: '<script>alert("test")</script>',
            description: 'HTML tags'
        },
        {
            content: "SELECT * FROM users; DROP TABLE users;",
            description: 'SQL injection attempt'
        }
    ];

    for (const testCase of testCases) {
        const response = await axiosInstance.post('/openai/chat/completions', {
            messages: [{ role: 'user', content: testCase.content }],
            model: 'openai'
        });
        
        t.is(response.status, 200, 
            `${testCase.description} should be handled successfully`);
        t.truthy(response.data.choices[0].message.content,
            `${testCase.description} should return a response`);
    }
});
