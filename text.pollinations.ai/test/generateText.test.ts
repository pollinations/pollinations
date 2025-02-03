import test from 'ava'
import { generateText as generateTextOpenai } from '../generateTextOpenai.js'
import generateTextHuggingface from '../generateTextHuggingface.js'
import { generateTextScaleway } from '../generateTextScaleway.js'

// Increase timeout for all tests
test.beforeEach(t => {
    t.timeout(30000) // 30 seconds
})

// Helper function to wait for all promises to settle
const waitForPromises = () => new Promise(resolve => setTimeout(resolve, 100))

test.afterEach(async () => {
    await waitForPromises()
})

// Add cleanup after all tests
test.after.always(async () => {
    await waitForPromises()
    // Force Node to exit after a reasonable timeout if something is still hanging
    setTimeout(() => process.exit(0), 1000)
})

// OpenAI Tests
test('generateTextOpenai should handle basic text generation', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        const response = await generateTextOpenai(messages, {})
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle system messages', async t => {
    try {
        const messages: Conversation = [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Hello' }
        ]
        const response = await generateTextOpenai(messages, {})
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle temperature parameter', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        const response = await generateTextOpenai(messages, { temperature: 0.7 })
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle jsonMode', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        const response = await generateTextOpenai(messages, { jsonMode: true })
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle long messages', async t => {
    try {
        const longContent = 'a'.repeat(260000)
        const messages: Conversation = [{ role: 'user', content: longContent }]
        const error = await t.throwsAsync(async () => {
            await generateTextOpenai(messages, {})
        })
        t.truthy(error.message.includes('Input text exceeds maximum length'), 'Should throw an error for long messages')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle search tool', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'What is the weather in London?' }]
        const response = await generateTextOpenai(messages, {}, true)
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle seed parameter', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        const response = await generateTextOpenai(messages, { seed: 42 })
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle array content', async t => {
    try {
        const messages: Conversation = [{
            role: 'user',
            content: [
                { type: 'text', text: 'Hello' },
                { type: 'text', text: 'World' }
            ]
        }]
        const response = await generateTextOpenai(messages, {})
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle web search', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Search for information about OpenAI' }]
        const response = await generateTextOpenai(messages, {}, true)
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle searchgpt model', async t => {
    try {
        const messages: Conversation = [{ 
            role: 'user', 
            content: 'What are the latest developments in quantum computing? Please search the web for recent breakthroughs.' 
        }]
        const response = await generateTextOpenai(messages, { model: 'searchgpt' }, true)
        t.truthy(response, 'Response should not be empty')
        t.truthy(response.choices && response.choices.length > 0, 'Should have a response with choices')
        t.truthy(response.choices[0].message.content, 'Should have content in response')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle web scraping', async t => {
    try {
        const messages: Conversation = [{ 
            role: 'user', 
            content: 'Can you scrape and summarize the content from https://en.wikipedia.org/wiki/Main_Page?' 
        }]
        const response = await generateTextOpenai(messages, { model: 'searchgpt' }, true)
        t.truthy(response, 'Response should not be empty')
        t.truthy(response.choices && response.choices.length > 0, 'Should have a response with choices')
        t.truthy(response.choices[0].message.content, 'Should have content in response')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle long messages with content array', async t => {
    try {
        const messages: Conversation = [{
            role: 'user',
            content: Array(10).fill('This is a very long message. ').map(msg => ({
                type: 'text',
                text: msg
            }))
        }]
        await generateTextOpenai(messages, {})
        t.pass()
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextOpenai should handle too long messages', async t => {
    try {
        const messages: Conversation = [{
            role: 'user',
            content: Array(20000).fill('This is a very long message. ').join('')
        }]
        await generateTextOpenai(messages, {})
        t.fail('Should have thrown error')
    } catch (error: any) {
        t.truthy(error.message.includes('exceeds maximum length'))
    }
})

test('generateTextOpenai should handle jsonMode with existing system message', async t => {
    try {
        const messages: Conversation = [
            { role: 'system', content: 'Be helpful' },
            { role: 'user', content: 'Hello' }
        ]
        await generateTextOpenai(messages, { jsonMode: true })
        t.pass()
    } catch (error: any) {
        t.fail(error.message)
    }
})

// Huggingface Tests
test('generateTextHuggingface should handle basic text generation', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        const response = await generateTextHuggingface(messages, {})
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextHuggingface should handle system messages', async t => {
    try {
        const messages: Conversation = [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Hello' }
        ]
        const response = await generateTextHuggingface(messages, {})
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextHuggingface should handle empty messages', async t => {
    try {
        await generateTextHuggingface([], {})
        t.fail('Should have thrown error for empty messages')
    } catch (error: any) {
        t.truthy(error, 'Should throw an error for empty messages')
    }
})

test('generateTextHuggingface should handle invalid messages format', async t => {
    try {
        await generateTextHuggingface([{ invalid: 'format' }] as any, {})
        t.fail('Should have thrown error for invalid message format')
    } catch (error: any) {
        t.truthy(error, 'Should throw an error for invalid message format')
    }
})

test('generateTextHuggingface should handle jsonMode', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        // const response = 
        await generateTextHuggingface(messages, { jsonMode: true })
        // FIXME: This test just passes...?
        t.pass()
    } catch (error: any) {
        t.fail(error.message)
    }
})

// Scaleway Tests
test('generateTextScaleway should handle basic text generation', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        const response = await generateTextScaleway(messages, {})
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextScaleway should handle temperature parameter', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        const response = await generateTextScaleway(messages, { temperature: 0.7 })
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextScaleway should handle qwen-coder model', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Write a simple hello world in Python' }]
        const response = await generateTextScaleway(messages, { model: 'qwen-coder' })
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextScaleway should handle llama model', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        const response = await generateTextScaleway(messages, { model: 'llama' })
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextScaleway should handle seed parameter', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        const response = await generateTextScaleway(messages, { seed: 42 })
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextScaleway should handle jsonMode without system message', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        const response = await generateTextScaleway(messages, { jsonMode: true })
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextScaleway should handle jsonMode with existing system message', async t => {
    try {
        const messages: Conversation = [
            { role: 'system', content: 'Be helpful' },
            { role: 'user', content: 'Hello' }
        ]
        const response = await generateTextScaleway(messages, { jsonMode: true })
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})

test('generateTextScaleway should use default model when invalid model specified', async t => {
    try {
        const messages: Conversation = [{ role: 'user', content: 'Hello' }]
        const response = await generateTextScaleway(messages, { model: 'invalid-model' })
        t.truthy(response, 'Response should not be empty')
    } catch (error: any) {
        t.fail(error.message)
    }
})
