import { expect, test, describe } from 'vitest';
import request from 'supertest';
import app from '../../server.js';

describe('Model Fallback Integration', () => {
    test('should successfully generate text with Scaleway model', async () => {
        const response = await request(app)
            .post('/openai')
            .send({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'mistral'
            });

        expect(response.status).toBe(200);
        expect(response.body.choices[0].message).toBeDefined();
        expect(response.body.choices[0].message.content).toBeDefined();
    });

    test('should fall back to OpenAI when Scaleway fails', async () => {
        // Force Scaleway to fail by using an invalid API key
        process.env.SCALEWAY_API_KEY = 'invalid_key';

        const response = await request(app)
            .post('/openai')
            .send({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'mistral'
            });

        expect(response.status).toBe(200);
        expect(response.body.choices[0].message).toBeDefined();
        expect(response.body.choices[0].message.content).toBeDefined();
    });

    test('should maintain response format consistency when falling back', async () => {
        // Force Scaleway to fail
        process.env.SCALEWAY_API_KEY = 'invalid_key';

        const response = await request(app)
            .post('/openai')
            .send({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'mistral',
                temperature: 0.7,
                jsonMode: true
            });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            choices: expect.arrayContaining([
                expect.objectContaining({
                    message: expect.objectContaining({
                        content: expect.any(String),
                        role: 'assistant'
                    })
                })
            ])
        });
    });

    test('should handle timeouts gracefully', async () => {
        // This test assumes the timeout is set to 45000ms in the implementation
        const response = await request(app)
            .post('/openai')
            .send({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'mistral'
            });

        expect(response.status).toBe(200);
        expect(response.body.choices[0].message).toBeDefined();
    }, 50000); // Set timeout higher than the model timeout
});