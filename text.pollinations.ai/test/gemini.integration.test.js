import test from 'ava';
import dotenv from 'dotenv';
import { generateTextGemini } from '../generateTextGemini.js';
import debug from 'debug';

const log = debug('pollinations:test:gemini');
const errorLog = debug('pollinations:test:gemini:error');

dotenv.config();

// Configure higher timeout for all tests
test.beforeEach(t => {
    t.timeout(40000); // 40 seconds in milliseconds
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    errorLog('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

/**
 * Test: Basic Text Generation
 * 
 * Purpose: Verify that the Gemini API can generate text with default settings.
 * 
 * Expected behavior:
 * 1. The response should match OpenAI format
 * 2. The response should contain meaningful text
 */
test.serial('should generate text with default model', async t => {
    const messages = [{ role: 'user', content: 'Hello, how are you?' }];
    const options = { model: 'gemini', temperature: 0.7 };

    const response = await generateTextGemini(messages, options);
    t.is(typeof response.choices[0].message.content, 'string', 'Response should be a string');
    t.true(response.choices[0].message.content.length > 0, 'Response should not be empty');
    t.is(response.choices[0].message.role, 'assistant', 'Response role should be assistant');
});

/**
 * Test: Thinking Model Variant
 * 
 * Purpose: Verify that the thinking model variant works correctly.
 * 
 * Expected behavior:
 * 1. The response should match OpenAI format
 * 2. The response should be more analytical in nature
 */
test.serial('should work with thinking model variant', async t => {
    const messages = [{ role: 'user', content: 'What are the implications of quantum computing on cryptography?' }];
    const options = { model: 'gemini-thinking', temperature: 0.5 };

    const response = await generateTextGemini(messages, options);
    t.is(typeof response.choices[0].message.content, 'string', 'Response should be a string');
    t.true(response.choices[0].message.content.length > 0, 'Response should not be empty');
    t.is(response.choices[0].message.role, 'assistant', 'Response role should be assistant');
});

/**
 * Test: Temperature Parameter
 * 
 * Purpose: Verify that the temperature parameter affects response creativity.
 * 
 * Expected behavior:
 * 1. Both responses should match OpenAI format
 * 2. Responses should differ with different temperatures
 */
test.serial('should respect temperature parameter', async t => {
    const messages = [{ role: 'user', content: 'Write a short story about a robot.' }];
    
    // Generate two responses with different temperatures
    const response1 = await generateTextGemini(messages, { model: 'gemini', temperature: 0.1 });
    const response2 = await generateTextGemini(messages, { model: 'gemini', temperature: 0.9 });

    t.is(typeof response1.choices[0].message.content, 'string', 'First response should be a string');
    t.is(typeof response2.choices[0].message.content, 'string', 'Second response should be a string');
    t.notDeepEqual(
        response1.choices[0].message.content,
        response2.choices[0].message.content,
        'Responses with different temperatures should differ'
    );
});

/**
 * Test: Error Handling
 * 
 * Purpose: Verify that the API handles errors gracefully.
 * 
 * Expected behavior:
 * 1. Should throw an error with invalid API key
 */
test.serial('should handle API errors gracefully', async t => {
    // Temporarily unset API key
    const originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'invalid-key';

    const messages = [{ role: 'user', content: 'Hello' }];
    const options = { model: 'gemini' };

    await t.throwsAsync(
        async () => {
            await generateTextGemini(messages, options);
        },
        { message: /Failed to generate text with Gemini API/ }
    );

    // Restore API key
    process.env.GEMINI_API_KEY = originalKey;
});

/**
 * Test: Message Formatting
 * 
 * Purpose: Verify that messages are formatted correctly.
 * 
 * Expected behavior:
 * 1. Should handle messages with and without roles
 * 2. Should handle messages with special characters
 */
test.serial('should handle various message formats', async t => {
    const messages = [
        { content: 'Message without role' },
        { role: 'user', content: 'Message with role' },
        { role: 'user', content: '🌟 Special characters! 🌍' }
    ];
    const options = { model: 'gemini' };

    const response = await generateTextGemini(messages, options);
    t.is(typeof response.choices[0].message.content, 'string', 'Response should be a string');
    t.true(response.choices[0].message.content.length > 0, 'Response should not be empty');
    t.is(response.choices[0].message.role, 'assistant', 'Response role should be assistant');
});
