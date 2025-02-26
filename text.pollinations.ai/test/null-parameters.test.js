import test from 'ava';
import { cleanUndefined } from '../textGenerationUtils.js';

/**
 * Tests for handling null and undefined parameters in API requests
 */

test('cleanUndefined should remove undefined values but keep defined values', t => {
    const input = {
        model: 'test-model',
        temperature: 0.7,
        extra: undefined,
        another: 'value'
    };
    
    const cleaned = cleanUndefined(input);
    
    t.is(Object.keys(cleaned).length, 3, 'Should have 3 properties');
    t.is(cleaned.model, 'test-model', 'Should keep model property');
    t.is(cleaned.temperature, 0.7, 'Should keep temperature property');
    t.is(cleaned.another, 'value', 'Should keep another property');
    t.is(cleaned.extra, undefined, 'Should remove undefined property');
    t.false('extra' in cleaned, 'Should not have extra property in object');
});

test('cleanUndefined does not currently remove null values', t => {
    const input = {
        model: 'test-model',
        temperature: 0.7,
        seed: null,
        maxTokens: null
    };
    
    const cleaned = cleanUndefined(input);
    
    // This test verifies the current behavior (keeping null values)
    t.is(Object.keys(cleaned).length, 4, 'Should have 4 properties');
    t.is(cleaned.seed, null, 'Should keep null seed property');
    t.is(cleaned.maxTokens, null, 'Should keep null maxTokens property');
    t.true('seed' in cleaned, 'Should have seed property in object');
    t.true('maxTokens' in cleaned, 'Should have maxTokens property in object');
});

/**
 * This test demonstrates the intended behavior for handling null values
 * after implementing the cleanNullAndUndefined function
 */
test('cleanNullAndUndefined should remove both null and undefined values', t => {
    // This function will be implemented in textGenerationUtils.js
    const cleanNullAndUndefined = obj => {
        const cleaned = { ...obj };
        Object.keys(cleaned).forEach(key => 
            (cleaned[key] === undefined || cleaned[key] === null) && delete cleaned[key]
        );
        return cleaned;
    };
    
    const input = {
        model: 'test-model',
        temperature: 0.7,
        seed: null,
        maxTokens: null,
        extra: undefined,
        zero: 0,
        empty: ''
    };
    
    const cleaned = cleanNullAndUndefined(input);
    
    t.is(Object.keys(cleaned).length, 4, 'Should have 4 properties');
    t.is(cleaned.model, 'test-model', 'Should keep model property');
    t.is(cleaned.temperature, 0.7, 'Should keep temperature property');
    t.is(cleaned.zero, 0, 'Should keep zero value');
    t.is(cleaned.empty, '', 'Should keep empty string');
    t.false('seed' in cleaned, 'Should not have seed property in object');
    t.false('maxTokens' in cleaned, 'Should not have maxTokens property in object');
    t.false('extra' in cleaned, 'Should not have extra property in object');
});