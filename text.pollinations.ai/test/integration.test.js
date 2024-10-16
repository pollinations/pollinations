import test from 'ava';
import axios from 'axios';
import { availableModels } from '../availableModels.js';

const baseUrl = 'https://text.pollinations.ai'; // Production server URL

// Function to generate a random seed
function generateRandomSeed() {
    return Math.floor(Math.random() * 1000000);
}

test('GET /models should return models', async t => {
    t.timeout(60000); // Set timeout to 60 seconds
    const response = await axios.get(`${baseUrl}/models`);
    t.is(response.status, 200);
    t.true(Array.isArray(response.data));
    t.true(response.data.length > 0);
});

// Test each model individually
availableModels.forEach(model => {
    test(`should return correct response for ${model.name}`, async t => {
        t.timeout(60000); // Set timeout to 60 seconds
        try {
            const seed = generateRandomSeed();
            const response = await axios.post(`${baseUrl}/`, {
                messages: [{ role: 'user', content: 'Test prompt for model' }],
                model: model.name,
                seed,
                cache: false
            });
            t.is(response.status, 200);
            t.truthy(response.data);
        } catch (error) {
            console.error(`Model ${model.name} failed with error:`, error.message);
            throw error; // Re-throw the error to fail the test
        }
    });
});

// Test error handling
test('should handle errors gracefully', async t => {
    t.timeout(60000); // Set timeout to 60 seconds
    try {
        await axios.post(`${baseUrl}/`, { messages: 'invalid', cache: false });
    } catch (error) {
        t.is(error.response.status, 400);
        t.is(error.response.data, 'Invalid messages array');
    }
});

// Test different responses for different seeds
test('should return different responses for different seeds', async t => {
    t.timeout(60000); // Set timeout to 60 seconds
    const messages = [{ role: 'user', content: 'Hello, how are you today? Write me a short poem' }];
    const numSeeds = 3; // Number of seeds to test
    const responses = [];

    for (let i = 0; i < numSeeds; i++) {
        const seed = generateRandomSeed();
        const response = await axios.post(`${baseUrl}/`, { messages, seed, cache: false });
        t.is(response.status, 200);
        responses.push(response.data);
    }

    // Compare responses to ensure they are different for different seeds
    for (let i = 1; i < numSeeds; i++) {
        t.notDeepEqual(responses[i], responses[0]);
    }
});

// Test JSON mode
test('should return JSON response when jsonMode is true', async t => {
    t.timeout(60000);
    const response = await axios.post(`${baseUrl}/`, {
        messages: [{ role: 'user', content: 'Return a JSON object with keys "name" and "age"' }],
        jsonMode: true,
        cache: false
    });
    t.is(response.status, 200);
    t.truthy(response.data);
    t.truthy(response.data.name);
    t.truthy(response.data.age);
});

// Test temperature parameter
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
    t.notDeepEqual(lowTempResponse.data, highTempResponse.data);
});

// Test system message handling
test('should handle system messages correctly', async t => {
    t.timeout(60000);
    const response = await axios.post(`${baseUrl}/`, {
        messages: [
            { role: 'system', content: 'You are a helpful assistant who greets with the word "ahoy".' },
            { role: 'user', content: 'Greet me' }
        ],
        cache: false
    });
    t.is(response.status, 200);
    t.truthy(response.data.toLowerCase().includes('ahoy'));
});

// Test OpenAI format compatibility
test('POST /openai should return OpenAI-compatible format', async t => {
    t.timeout(60000);
    const response = await axios.post(`${baseUrl}/openai/chat/completions`, {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4',
        cache: false
    });
    t.is(response.status, 200);
    t.truthy(response.data.choices);
    t.truthy(response.data.choices[0].message);
    t.truthy(response.data.choices[0].message.content);
});

// // Test streaming responses
// test('POST /openai should support streaming', async t => {
//     t.timeout(60000);
//     const response = await axios.post(`${baseUrl}/openai/chat/completions`, {
//         messages: [{ role: 'user', content: 'Count to 5' }],
//         model: 'gpt-4',
//         stream: true,
//         cache: false
//     }, { responseType: 'stream' });
//     t.is(response.status, 200);
//     t.is(response.headers['content-type'], 'text/event-stream; charset=utf-8');
// });
