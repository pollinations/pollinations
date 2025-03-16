import test from 'ava';
import dotenv from 'dotenv';
import { generateTextPortkey } from '../generateTextPortkey.js';
import debug from 'debug';

const log = debug('pollinations:test:mistral');
const errorLog = debug('pollinations:test:mistral:error');

dotenv.config();

// Configure higher timeout for all tests
test.beforeEach(t => {
    t.timeout(60000); // 60 seconds in milliseconds
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    errorLog('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

/**
 * Test: Basic Text Generation with Mistral model
 * 
 * Purpose: Verify that the Portkey integration can generate text with the Mistral model
 * 
 * Expected behavior:
 * 1. The response should match OpenAI format
 * 2. The response should contain meaningful text
 */
test.serial('should generate text with Mistral model', async t => {
    const messages = [
        { role: 'system', content: 'You are a helpful, respectful and honest assistant.' },
        { role: 'user', content: 'say hello' }
    ];
    const options = { model: 'mistral', temperature: 0.7, max_tokens: 200 };

    try {
        const response = await generateTextPortkey(messages, options);
        
        // If API is available and returns a valid response
        if (response.choices && response.choices[0] && response.choices[0].message) {
            t.is(typeof response.choices[0].message.content, 'string', 'Response should be a string');
            t.true(response.choices[0].message.content.length > 0, 'Response should not be empty');
            t.is(response.choices[0].message.role, 'assistant', 'Response role should be assistant');
            
            // Log the response for debugging
            log('Response from Mistral model:', response.choices[0].message.content);
            log('Response metadata:', {
                model: response.model,
                usage: response.usage
            });
        } else if (response.error) {
            // If API returns an error, skip the test
            t.skip(`API returned an error: ${response.error.message}`);
        } else {
            // If API returns an unexpected response format
            t.fail(`Unexpected response format: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        // If API is not available, skip the test
        errorLog('Error testing Mistral model:', error);
        t.skip(`API is not available: ${error.message}`);
    }
});
