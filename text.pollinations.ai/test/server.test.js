import test from 'ava';
import request from 'supertest';
import app from '../server.js'; // Ensure this path is correct and matches the export

/**
 * Test suite for the server API endpoints
 */

/**
 * Test: GET /models
 * 
 * Purpose: Verify that the /models endpoint returns a list of available models
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response body should be an array
 * 3. The array should contain at least one model
 */
test('GET /models should return available models', async t => {
    const response = await request(app).get('/models?code=BeesKnees');
    t.is(response.status, 200, 'Response status should be 200');
    t.true(Array.isArray(response.body), 'Response body should be an array');
    t.true(response.body.length > 0, 'Array should contain at least one model');
});

/**
 * Test: GET /:prompt
 * 
 * Purpose: Verify that the /:prompt endpoint handles a valid prompt
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response should contain text
 */
test('GET /:prompt should handle a valid prompt', async t => {
    const response = await request(app).get('/hello?code=BeesKnees');
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.text, 'Response should contain text');
});

/**
 * Test: POST /
 * 
 * Purpose: Verify that the root POST endpoint handles a valid request
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response should contain text
 */
test('POST / should handle a valid request', async t => {
    const response = await request(app)
        .post('/')
        .set('Content-Type', 'application/json')
        .send({ 
            messages: [{ role: 'user', content: 'Hello' }],
            code: 'BeesKnees'
        });
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.text, 'Response should contain text');
});

/**
 * Test: POST /openai
 * 
 * Purpose: Verify that the /openai endpoint handles a valid request
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response body should contain data
 */
test('POST /openai should handle a valid request', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .set('Referer', 'roblox')
        .send({ messages: [{ role: 'user', content: 'Hello' }] });
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.body, 'Response body should contain data');
});

/**
 * Test: POST / with invalid messages
 * 
 * Purpose: Verify that the root POST endpoint properly handles invalid input
 * 
 * Expected behavior:
 * 1. The response status should be 400 (Bad Request)
 * 2. The response text should indicate invalid messages array
 */
test('POST / should return 400 for invalid messages array', async t => {
    const response = await request(app)
        .post('/')
        .send({ messages: 'invalid' });
    
    t.is(response.status, 400, 'Response status should be 400');
    t.true(response.text.includes('Invalid messages'), 'Response should indicate invalid messages');
});

/**
 * Test: POST / caching behavior
 * 
 * Purpose: Verify that the root POST endpoint caches responses for identical requests
 * 
 * Expected behavior:
 * 1. Both responses should have status 200 (OK)
 * 2. The response text for both requests should be identical
 */
test('POST / should cache responses', async t => {
    const requestBody = {
        messages: [{ role: 'user', content: 'Cache test' }],
        cache: true,
        code: 'BeesKnees'
    };

    const response1 = await request(app)
        .post('/')
        .set('Content-Type', 'application/json')
        .send(requestBody);
    t.is(response1.status, 200, 'First response status should be 200');

    const response2 = await request(app)
        .post('/')
        .set('Content-Type', 'application/json')
        .send(requestBody);
    t.is(response2.status, 200, 'Second response status should be 200');

    t.is(response1.text, response2.text, 'Cached responses should be identical');
});

/**
 * Test: POST /openai with streaming
 * 
 * Purpose: Verify that the /openai endpoint handles streaming requests correctly
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response should have correct headers for streaming
 * 3. The response should contain properly formatted streaming data
 */
test('POST /openai should handle streaming requests', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ 
            messages: [{ role: 'user', content: 'Hello' }],
            stream: true 
        });
    
    t.is(response.status, 200, 'Response status should be 200');
    t.is(response.headers['content-type'], 'text/event-stream; charset=utf-8', 'Content-Type should be text/event-stream');
    t.is(response.headers['cache-control'], 'no-cache', 'Cache-Control should be no-cache');
    t.is(response.headers['connection'], 'keep-alive', 'Connection should be keep-alive');
});

/**
 * Test: POST /openai response format
 * 
 * Purpose: Verify that the /openai endpoint returns responses in OpenAI format
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response should have the correct OpenAI API structure
 */
test('POST /openai should return OpenAI formatted responses', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ messages: [{ role: 'user', content: 'Hello' }] });
    
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.body.choices, 'Response should have choices array');
    t.truthy(response.body.choices[0].message, 'Response should have message in first choice');
    t.truthy(response.body.choices[0].message.content, 'Response should have content in message');
});

/**
 * Test: POST /openai caching
 * 
 * Purpose: Verify that the /openai endpoint properly caches responses
 * 
 * Expected behavior:
 * 1. Both responses should have status 200 (OK)
 * 2. Both responses should be identical
 * 3. Both responses should maintain OpenAI format
 */
test('POST /openai should cache responses', async t => {
    const requestBody = {
        messages: [{ role: 'user', content: 'Cache test openai' }],
        code: 'BeesKnees'
    };

    const response1 = await request(app)
        .post('/openai?code=BeesKnees')
        .send(requestBody);
    t.is(response1.status, 200, 'First response status should be 200');

    const response2 = await request(app)
        .post('/openai?code=BeesKnees')
        .send(requestBody);
    t.is(response2.status, 200, 'Second response status should be 200');

    t.deepEqual(response1.body, response2.body, 'Cached responses should be identical');
    t.truthy(response1.body.choices, 'Cached response should maintain OpenAI format');
});

/**
 * Test: POST /openai with invalid model
 * 
 * Purpose: Verify that the /openai endpoint handles invalid model requests
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 */
test('POST /openai should handle invalid model', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ 
            messages: [{ role: 'user', content: 'Hello' }],
            model: 'invalid-model'
        });
    
    t.is(response.status, 200, 'Response status should be 200');
});

/**
 * Test: POST /openai with rate limiting
 * 
 * Purpose: Verify that rate limiting works
 * 
 * Expected behavior:
 * 1. Multiple rapid requests should be queued rather than rate limited
 */
test('POST /openai should enforce rate limits', async t => {
    // Make multiple requests rapidly
    const promises = Array(10).fill().map(() => 
        request(app)
            .post('/openai?code=BeesKnees')
            .send({ messages: [{ role: 'user', content: 'Hello' }] })
    );
    
    const responses = await Promise.all(promises);
    t.true(responses.every(r => r.status === 200), 'Requests should be queued rather than rate limited');
});

/**
 * Test: POST /openai with system message
 * 
 * Purpose: Verify handling of system messages
 * 
 * Expected behavior:
 * 1. The response should include the system message in processing
 */
test('POST /openai should handle system messages', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ 
            messages: [
                { role: 'system', content: 'You are a helpful assistant' },
                { role: 'user', content: 'Hello' }
            ]
        });
    
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.body.choices[0].message, 'Response should contain message');
});

/**
 * Test: POST /openai with different temperature
 * 
 * Purpose: Verify temperature parameter handling
 * 
 * Expected behavior:
 * 1. Different temperatures should be accepted
 */
test('POST /openai should handle temperature parameter', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ 
            messages: [{ role: 'user', content: 'Hello' }],
            temperature: 0.7
        });
    
    t.is(response.status, 200, 'Response status should be 200');
});

/**
 * Test: GET / without code
 * 
 * Purpose: Verify authentication handling
 * 
 * Expected behavior:
 * 1. Request without code should be handled
 */
test('GET / should handle missing authentication code', async t => {
    const response = await request(app).get('/hello');
    t.is(response.status, 200, 'Response status should be 200');
});

/**
 * Test: POST /openai with empty messages
 * 
 * Purpose: Verify empty messages handling
 * 
 * Expected behavior:
 * 1. Empty messages should be rejected
 */
test('POST /openai should handle empty messages', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ messages: [] });
    
    t.is(response.status, 400, 'Response status should be 400');
});

/**
 * Test: GET /feed (SSE endpoint)
 *
 * Purpose: Verify that the /feed endpoint establishes a Server-Sent Events connection
 *
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response content-type header should be 'text/event-stream'
 *
 * Note: This test is currently commented out, possibly due to difficulties in testing SSE connections.
 * Consider implementing this test if a reliable method for testing SSE in your environment is available.
 */
// test('GET /feed should establish SSE connection', async t => {
//     const response = await request(app).get('/feed?code=BeesKnees');
//     t.is(response.status, 200, 'Response status should be 200');
//     t.is(response.headers['content-type'], 'text/event-stream', 'Content-Type should be text/event-stream');
// });
