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
