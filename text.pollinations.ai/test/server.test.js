import test from 'ava';
import request from 'supertest';
import app from '../server.js'; // Ensure this path is correct and matches the export

test('GET /models should return available models', async t => {
    const response = await request(app).get('/models');
    t.is(response.status, 200);
    t.true(Array.isArray(response.body));
    t.true(response.body.length > 0);
});

test('GET /:prompt should handle a valid prompt', async t => {
    const response = await request(app).get('/hello');
    t.is(response.status, 200);
    t.truthy(response.text);
});

test('POST / should handle a valid request', async t => {
    const response = await request(app)
        .post('/')
        .send({ messages: [{ role: 'user', content: 'Hello' }] });
    t.is(response.status, 200);
    t.truthy(response.text);
});

test('POST /openai should handle a valid request', async t => {
    const response = await request(app)
        .post('/openai')
        .send({ messages: [{ role: 'user', content: 'Hello' }] });
    t.is(response.status, 200);
    t.truthy(response.body);
});

// New test for invalid POST request
test('POST / should return 400 for invalid messages array', async t => {
    const response = await request(app)
        .post('/')
        .send({ messages: 'invalid' });
    t.is(response.status, 400);
    t.is(response.text, 'Invalid messages array');
});


// New test for caching behavior
test('POST / should cache responses', async t => {
    const messages = [{ role: 'user', content: 'Hello' }];
    const response1 = await request(app).post('/').send({ messages });
    const response2 = await request(app).post('/').send({ messages });
    t.is(response1.status, 200);
    t.is(response2.status, 200);
    t.is(response1.text, response2.text);
});

// // New test for SSE endpoint
// test('GET /feed should establish SSE connection', async t => {
//     const response = await request(app).get('/feed');
//     t.is(response.status, 200);
//     t.is(response.headers['content-type'], 'text/event-stream');
// });
