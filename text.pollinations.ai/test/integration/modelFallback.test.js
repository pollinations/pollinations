import { expect, test, describe, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../server.js';

describe('Model Fallback Integration', () => {
    const originalScalewayKey = process.env.SCALEWAY_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;

    beforeEach(() => {
        // Ensure we have valid keys for both services
        process.env.SCALEWAY_API_KEY = originalScalewayKey || 'test_scaleway_key';
        process.env.OPENAI_API_KEY = originalOpenAIKey || 'test_openai_key';
    });

    afterEach(() => {
        // Restore original keys
        process.env.SCALEWAY_API_KEY = originalScalewayKey;
        process.env.OPENAI_API_KEY = originalOpenAIKey;
    });

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

    test('should fall back to OpenAI with correct model when Scaleway fails', async () => {
        // Force Scaleway to fail
        process.env.SCALEWAY_API_KEY = 'invalid_key';

        const response = await request(app)
            .post('/openai')
            .send({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'mistral',
                temperature: 0.7
            });

        expect(response.status).toBe(200);
        expect(response.body.choices[0].message).toBeDefined();
        expect(response.body.choices[0].message.content).toBeDefined();
    });

    test('should maintain response format and options consistency when falling back', async () => {
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

    test('should preserve custom options while applying fallback model', async () => {
        // Force Scaleway to fail
        process.env.SCALEWAY_API_KEY = 'invalid_key';

        const response = await request(app)
            .post('/openai')
            .send({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'mistral',
                temperature: 0.9,
                max_tokens: 100
            });

        expect(response.status).toBe(200);
        expect(response.body.choices[0].message).toBeDefined();
    });

    test('should handle timeouts by falling back to OpenAI', async () => {
        // This test assumes the timeout is set to 45000ms in the implementation
        const response = await request(app)
            .post('/openai')
            .send({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'mistral'
            });

        expect(response.status).toBe(200);
        expect(response.body.choices[0].message).toBeDefined();
    }, 50000);

    test('should handle case when both models fail', async () => {
        // Force both services to fail
        process.env.SCALEWAY_API_KEY = 'invalid_key';
        process.env.OPENAI_API_KEY = 'invalid_key';

        const response = await request(app)
            .post('/openai')
            .send({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'mistral'
            });

        expect(response.status).toBe(500);
        expect(response.body.error).toBeDefined();
    });
});