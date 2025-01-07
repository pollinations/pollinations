import test from 'ava';
import axios from 'axios';
import { availableModels } from '../availableModels.js';

const baseUrl = 'https://text.pollinations.ai'; // Production server URL

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
    t.timeout(60000); // Set timeout to 60 seconds to account for potential network latency
    const response = await axios.get(`${baseUrl}/models`);
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
        t.timeout(60000); // 60-second timeout for each model test
        try {
            const seed = generateRandomSeed();
            const response = await axios.post(`${baseUrl}/`, {
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
 * Purpose: Verify that the API handles invalid input gracefully.
 * 
 * Steps:
 * 1. Send a POST request with invalid 'messages' parameter.
 * 2. Disable caching to ensure a fresh response.
 * 
 * Expected behavior:
 * 1. The response status should be 400 (Bad Request).
 * 2. The response should contain the error message "Invalid messages array".
 */
test('should handle errors gracefully', async t => {
    t.timeout(60000);
    try {
        await axios.post(`${baseUrl}/`, { messages: 'invalid', cache: false });
    } catch (error) {
        t.is(error.response.status, 400, 'Response status should be 400 for invalid input');
        t.is(error.response.data, 'Invalid messages array', 'Error message should indicate invalid messages');
    }
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
    t.timeout(60000);
    const messages = [{ role: 'user', content: 'Hello, how are you today? Write me a short poem' }];
    const numSeeds = 3; // Number of seeds to test
    const responses = [];

    for (let i = 0; i < numSeeds; i++) {
        const seed = generateRandomSeed();
        const response = await axios.post(`${baseUrl}/`, { messages, seed, cache: false });
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
    t.timeout(60000);
    const response = await axios.post(`${baseUrl}/`, {
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
    t.timeout(60000);
    const lowTempResponse = await axios.post(`${baseUrl}/`, {
        messages: [{ role: 'user', content: 'Write a creative story' }],
        temperature: 0.1,
        cache: false
    });
    const highTempResponse = await axios.post(`${baseUrl}/`, {
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
    t.timeout(60000);
    const response = await axios.post(`${baseUrl}/`, {
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
    t.timeout(60000);
    const response = await axios.post(`${baseUrl}/openai/chat/completions`, {
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
    t.timeout(60000);
    const response = await axios.post(`${baseUrl}/openai/chat/completions`, {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'non-existent-model',
        cache: false
    });
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.data.choices, 'Response should contain a "choices" array');
    t.truthy(response.data.choices[0].message, 'First choice should have a "message" object');
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
// test('POST /openai should support streaming', async t => {
//     t.timeout(60000);
//     const response = await axios.post(`${baseUrl}/openai/chat/completions`, {
//         messages: [{ role: 'user', content: 'Count to 5' }],
//         model: 'gpt-4',
//         stream: true,
//         cache: false
//     }, { responseType: 'stream' });
//     t.is(response.status, 200, 'Response status should be 200');
//     t.is(response.headers['content-type'], 'text/event-stream; charset=utf-8', 'Content-Type should be text/event-stream');
// });
