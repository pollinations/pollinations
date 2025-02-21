import { generateText } from '../generateTextPortkey.js';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('generateText with openai model', async (t) => {
    const messages = [
        { role: 'user', content: 'Hello, how are you?' }
    ];
    
    const response = await generateText(messages, { model: 'openai' });
    assert.ok(response.choices[0].message.content);
});

test('generateText with openai-large model', async (t) => {
    const messages = [
        { role: 'user', content: 'What is the meaning of life?' }
    ];
    
    const response = await generateText(messages, { model: 'openai-large' });
    assert.ok(response.choices[0].message.content);
});

test('generateText with invalid model', async (t) => {
    const messages = [
        { role: 'user', content: 'Hello' }
    ];
    
    await assert.rejects(
        async () => {
            await generateText(messages, { model: 'invalid-model' });
        },
        {
            name: 'Error',
            message: 'Unknown model: invalid-model'
        }
    );
});

test('generateText with streaming', async (t) => {
    const messages = [
        { role: 'user', content: 'Tell me a story' }
    ];
    
    const response = await generateText(messages, { model: 'openai', stream: true });
    assert.ok(response);
});
