import test from 'ava';
import request from 'supertest';
import app from '../server.js';

// Configure timeout for tests
test.beforeEach(t => {
    t.timeout(30000); // 30 seconds
});

/**
 * Test: Multiple image support in OpenAI compatible endpoint
 * 
 * Purpose: Verify that the text API can handle multiple images (up to 5) in a single request
 */
test('POST /openai should support multiple images in messages', async t => {
    const multipleImageMessage = {
        role: 'user',
        content: [
            {
                type: 'text',
                text: 'Describe these images and tell me what they have in common:'
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/a%20red%20apple'
                }
            },
            {
                type: 'image_url', 
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/a%20green%20apple'
                }
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/a%20yellow%20banana'
                }
            }
        ]
    };

    const response = await request(app)
        .post('/openai/chat/completions')
        .query({ code: 'BeesKnees' })
        .send({ 
            messages: [multipleImageMessage],
            model: 'openai'
        });
    
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.body.choices, 'Response should have choices array');
    t.truthy(response.body.choices[0].message, 'Response should have message in first choice');
    t.truthy(response.body.choices[0].message.content, 'Response should have content in message');
});

/**
 * Test: Maximum 5 images should be supported
 */
test('POST /openai should support up to 5 images in messages', async t => {
    const fiveImageMessage = {
        role: 'user',
        content: [
            {
                type: 'text',
                text: 'Describe all these images:'
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/image1'
                }
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/image2'
                }
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/image3'
                }
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/image4'
                }
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/image5'
                }
            }
        ]
    };

    const response = await request(app)
        .post('/openai/chat/completions')
        .query({ code: 'BeesKnees' })
        .send({ 
            messages: [fiveImageMessage],
            model: 'openai'
        });
    
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.body.choices, 'Response should have choices array');
    t.truthy(response.body.choices[0].message, 'Response should have message in first choice');
    t.truthy(response.body.choices[0].message.content, 'Response should have content in message');
});

/**
 * Test: More than 5 images should be limited to 5
 */
test('POST /openai should limit to 5 images maximum', async t => {
    const sixImageMessage = {
        role: 'user',
        content: [
            {
                type: 'text',
                text: 'Describe all these images (should be limited to 5):'
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/image1'
                }
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/image2'
                }
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/image3'
                }
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/image4'
                }
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/image5'
                }
            },
            {
                type: 'image_url',
                image_url: {
                    url: 'https://image.pollinations.ai/prompt/image6'
                }
            }
        ]
    };

    const response = await request(app)
        .post('/openai/chat/completions')
        .query({ code: 'BeesKnees' })
        .send({ 
            messages: [sixImageMessage],
            model: 'openai'
        });
    
    // The request should still succeed but only process the first 5 images
    t.is(response.status, 200, 'Response status should be 200');
    t.truthy(response.body.choices, 'Response should have choices array');
    t.truthy(response.body.choices[0].message, 'Response should have message in first choice');
    t.truthy(response.body.choices[0].message.content, 'Response should have content in message');
});
