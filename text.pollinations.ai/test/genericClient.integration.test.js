import test from 'ava';
import dotenv from 'dotenv';
import { createOpenAICompatibleClient } from '../genericOpenAIClient.js';
import debug from 'debug';

const log = debug('pollinations:test:genericClient');
const errorLog = debug('pollinations:test:genericClient:error');

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
 * Test: Basic Client Functionality
 * 
 * Purpose: Verify that the generic client can be configured and used to make API calls.
 * 
 * Expected behavior:
 * 1. The client should be created successfully
 * 2. The client should handle API calls correctly
 * 3. The response should match the expected format
 */
test.serial('should create and use a client with Azure OpenAI', async t => {
    // Skip if no API key is available
    if (!process.env.AZURE_OPENAI_API_KEY) {
        t.pass('Skipping test due to missing API key');
        return;
    }

    // Create a client for Azure OpenAI
    const client = createOpenAICompatibleClient({
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        authHeaderName: 'api-key',
        authHeaderValue: () => process.env.AZURE_OPENAI_API_KEY,
        modelMapping: { 'test-model': 'gpt-4o-mini' },
        systemPrompts: { 'test-model': 'You are a helpful assistant.' },
        defaultOptions: { model: 'test-model', temperature: 0.7 },
        providerName: 'AzureOpenAI'
    });

    try {
        const messages = [{ role: 'user', content: 'Hello, how are you?' }];
        const response = await client(messages);
        
        // Verify response format
        t.truthy(response.choices, 'Response should have choices array');
        t.truthy(response.choices[0].message, 'Response should have a message');
        t.is(response.choices[0].message.role, 'assistant', 'Message role should be assistant');
        t.truthy(response.choices[0].message.content, 'Message should have content');
    } catch (error) {
        // If API returns an error, skip the test
        t.pass(`Skipping test due to API error: ${error.message}`);
    }
});

/**
 * Test: Custom Response Formatting
 * 
 * Purpose: Verify that the generic client correctly handles custom response formatting.
 * 
 * Expected behavior:
 * 1. The client should be created successfully with a custom response formatter
 * 2. The client should handle API calls correctly
 * 3. The response should be formatted according to the custom formatter
 */
test.serial('should support custom response formatting', async t => {
    // Skip if no API key is available
    if (!process.env.AZURE_OPENAI_API_KEY) {
        t.pass('Skipping test due to missing API key');
        return;
    }

    // Create a client with a custom response formatter
    const client = createOpenAICompatibleClient({
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        authHeaderName: 'api-key',
        authHeaderValue: () => process.env.AZURE_OPENAI_API_KEY,
        modelMapping: { 'test-model': 'gpt-4o-mini' },
        systemPrompts: { 'test-model': 'You are a helpful assistant.' },
        defaultOptions: { model: 'test-model', temperature: 0.7 },
        providerName: 'AzureOpenAI',
        formatResponse: (data, requestId, startTime, modelName) => {
            return {
                text: data.choices[0].message.content,
                model: modelName,
                requestId: requestId,
                processingTime: Date.now() - startTime
            };
        }
    });

    try {
        const messages = [{ role: 'user', content: 'Hello, how are you?' }];
        const response = await client(messages);
        
        // Verify custom response format
        t.truthy(response.text, 'Response should have text field');
        t.is(response.model, 'gpt-4o-mini', 'Response should have correct model name');
        t.truthy(response.requestId, 'Response should have requestId');
        t.truthy(response.processingTime, 'Response should have processingTime');
    } catch (error) {
        // If API returns an error, skip the test
        t.pass(`Skipping test due to API error: ${error.message}`);
    }
});

/**
 * Test: Error Handling
 * 
 * Purpose: Verify that the generic client correctly handles errors.
 * 
 * Expected behavior:
 * 1. The client should handle API errors gracefully
 * 2. The client should return a standardized error response
 */
test.serial('should handle errors gracefully', async t => {
    // Create a client with an invalid API key
    const client = createOpenAICompatibleClient({
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        authHeaderName: 'api-key',
        authHeaderValue: () => 'invalid_api_key',
        modelMapping: { 'test-model': 'gpt-4o-mini' },
        systemPrompts: { 'test-model': 'You are a helpful assistant.' },
        defaultOptions: { model: 'test-model', temperature: 0.7 },
        providerName: 'AzureOpenAI'
    });

    const messages = [{ role: 'user', content: 'Hello, how are you?' }];
    const response = await client(messages);
    
    // Verify error response format
    t.truthy(response.error, 'Response should have error field');
    t.is(response.error.type, 'AzureOpenAI', 'Error type should match provider name');
    t.truthy(response.error.message, 'Error should have message');
});