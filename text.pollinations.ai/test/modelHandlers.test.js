import test from 'ava';
import { getHandler, modelHandlers } from '../availableModels.js';

/**
 * Test suite for the model handlers
 */

/**
 * Test: getHandler function
 * 
 * Purpose: Verify that the getHandler function returns a function for valid models
 * 
 * Expected behavior:
 * 1. The function should return a function for valid models
 * 2. The function should return the default handler for invalid models
 */
test('getHandler should return a function for valid models', t => {
    const handler = getHandler('openai');
    t.is(typeof handler, 'function', 'Handler should be a function');
});

test('getHandler should return default handler for invalid models', t => {
    const handler = getHandler('non-existent-model');
    t.is(typeof handler, 'function', 'Handler should be a function');
    
    // The default handler should be the same as the openai handler
    const defaultHandler = getHandler('openai');
    t.is(handler, defaultHandler, 'Default handler should be the same as openai handler');
});

/**
 * Test: modelHandlers object
 * 
 * Purpose: Verify that the modelHandlers object contains handlers for all expected models
 * 
 * Expected behavior:
 * 1. The object should contain handlers for all expected models
 * 2. Each handler should be a function
 */
test('modelHandlers should contain handlers for all expected models', t => {
    const expectedModels = [
        'openai',
        'deepseek',
        'mistral',
        'qwen-coder',
        'llama',
        'llamalight',
        'llamaguard',
        'gemini',
        'sur',
        'unity',
        'midijourney',
        'rtist',
        'searchgpt',
        'evil',
        'claude-hybridspace',
        'hypnosis-tracy'
    ];
    
    for (const model of expectedModels) {
        t.truthy(modelHandlers[model], `modelHandlers should contain a handler for ${model}`);
        t.is(typeof modelHandlers[model], 'function', `Handler for ${model} should be a function`);
    }
});

/**
 * Test: Different handlers for different models
 * 
 * Purpose: Verify that different models have different handlers
 * 
 * Expected behavior:
 * 1. Different models should have different handlers
 */
test('Different models should have different handlers', t => {
    const models = ['openai', 'deepseek', 'mistral', 'sur'];
    
    // Each model should have a unique handler
    const handlers = models.map(model => getHandler(model));
    const uniqueHandlers = new Set(handlers);
    
    // At least some of the handlers should be different
    t.true(uniqueHandlers.size > 1, 'At least some handlers should be different');
});