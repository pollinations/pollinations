import test from 'ava';
import axios from 'axios';

const baseUrl = 'https://text.pollinations.ai'; // Production server URL

test('GET /models should return cached models', async t => {
    t.timeout(60000); // Set timeout to 60 seconds
    const response = await axios.get(`${baseUrl}/models`);
    t.is(response.status, 200);
    t.true(Array.isArray(response.data));
    t.true(response.data.length > 0);
    // Additional checks for caching behavior
});

// ... additional tests for other endpoints ...

test('POST / should return different responses for different seeds', async t => {
    t.timeout(60000); // Set timeout to 60 seconds
    const messages = [{ role: 'user', content: 'Hello, how are you today? Write me a short poem' }];
    const numSeeds = 53; // Number of seeds to test
    const responses = [];

    for (let i = 0; i < numSeeds; i++) {
        const seed = i;
        const response = await axios.post(`${baseUrl}/`, { messages, seed });
        t.is(response.status, 200);
        responses.push(response.data);
    }

    // Compare responses to ensure they are different for different seeds
    for (let i = 1; i < numSeeds; i++) {
        t.notDeepEqual(responses[i], responses[0]);
    }
});
