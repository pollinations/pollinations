import test from 'ava';
import { generateText as generateTextOpenai } from '../generateTextOpenai.js';
import generateTextHuggingface from '../generateTextHuggingface.js';
import { generateTextScaleway } from '../generateTextScaleway.js';

// Helper function to wait for all promises to settle
const waitForPromises = () => new Promise(resolve => setTimeout(resolve, 100));

test.afterEach(async () => {
    await waitForPromises();
});

// OpenAI Tests
test('generateTextOpenai should handle basic text generation', async t => {
    try {
        const messages = [{ role: 'user', content: 'Hello' }];
        const response = await generateTextOpenai(messages, {});
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextOpenai should handle system messages', async t => {
    try {
        const messages = [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Hello' }
        ];
        const response = await generateTextOpenai(messages, {});
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextOpenai should handle temperature parameter', async t => {
    try {
        const messages = [{ role: 'user', content: 'Hello' }];
        const response = await generateTextOpenai(messages, { temperature: 0.7 });
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextOpenai should handle jsonMode', async t => {
    try {
        const messages = [{ role: 'user', content: 'Hello' }];
        const response = await generateTextOpenai(messages, { jsonMode: true });
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextOpenai should handle long messages', async t => {
    try {
        const longContent = 'a'.repeat(60000);
        const messages = [{ role: 'user', content: longContent }];
        const error = await t.throwsAsync(async () => {
            await generateTextOpenai(messages, {});
        });
        t.truthy(error.message.includes('Input text exceeds maximum length'), 'Should throw an error for long messages');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextOpenai should handle search tool', async t => {
    try {
        const messages = [{ role: 'user', content: 'What is the weather in London?' }];
        const response = await generateTextOpenai(messages, {}, true);
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextOpenai should handle seed parameter', async t => {
    try {
        const messages = [{ role: 'user', content: 'Hello' }];
        const response = await generateTextOpenai(messages, { seed: 42 });
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextOpenai should handle array content', async t => {
    try {
        const messages = [{
            role: 'user',
            content: [
                { type: 'text', text: 'Hello' },
                { type: 'text', text: 'World' }
            ]
        }];
        const response = await generateTextOpenai(messages, {});
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextOpenai should handle web search', async t => {
    try {
        const messages = [{ role: 'user', content: 'Search for information about OpenAI' }];
        const response = await generateTextOpenai(messages, {}, true);
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextOpenai should handle searchgpt model', async t => {
    try {
        const messages = [{ 
            role: 'user', 
            content: 'What are the latest developments in quantum computing? Please search the web for recent breakthroughs.' 
        }];
        const response = await generateTextOpenai(messages, { model: 'searchgpt' }, true);
        t.truthy(response, 'Response should not be empty');
        t.truthy(response.choices && response.choices.length > 0, 'Should have a response with choices');
        t.truthy(response.choices[0].message.content, 'Should have content in response');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextOpenai should handle web scraping', async t => {
    try {
        const messages = [{ 
            role: 'user', 
            content: 'Can you scrape and summarize the content from https://example.com?' 
        }];
        const response = await generateTextOpenai(messages, { model: 'searchgpt' }, true);
        t.truthy(response, 'Response should not be empty');
        t.truthy(response.choices && response.choices.length > 0, 'Should have a response with choices');
        t.truthy(response.choices[0].message.content, 'Should have content in response');
    } catch (error) {
        t.fail(error.message);
    }
});

// Huggingface Tests
test('generateTextHuggingface should handle basic text generation', async t => {
    try {
        const messages = [{ role: 'user', content: 'Hello' }];
        const response = await generateTextHuggingface(messages, {});
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextHuggingface should handle system messages', async t => {
    try {
        const messages = [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Hello' }
        ];
        const response = await generateTextHuggingface(messages, {});
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextHuggingface should handle empty messages', async t => {
    try {
        await generateTextHuggingface([], {});
        t.fail('Should have thrown error for empty messages');
    } catch (error) {
        t.truthy(error, 'Should throw an error for empty messages');
    }
});

test('generateTextHuggingface should handle invalid messages format', async t => {
    try {
        await generateTextHuggingface([{ invalid: 'format' }], {});
        t.fail('Should have thrown error for invalid message format');
    } catch (error) {
        t.truthy(error, 'Should throw an error for invalid message format');
    }
});

// Scaleway Tests
test('generateTextScaleway should handle basic text generation', async t => {
    try {
        const messages = [{ role: 'user', content: 'Hello' }];
        const response = await generateTextScaleway(messages, {});
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});

test('generateTextScaleway should handle temperature parameter', async t => {
    try {
        const messages = [{ role: 'user', content: 'Hello' }];
        const response = await generateTextScaleway(messages, { temperature: 0.7 });
        t.truthy(response, 'Response should not be empty');
    } catch (error) {
        t.fail(error.message);
    }
});
