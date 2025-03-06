import test from 'ava';
import { cleanNullAndUndefined } from '../textGenerationUtils.js';

/**
 * NOTE: The client tests in this file have been deprecated in favor of integration tests.
 * Please see:
 * - cloudflare-null-parameters.integration.test.js
 * - cloudflare-null-handling.integration.test.js
 * 
 * The original unit tests have been preserved in cloudflare-params.test.js.bak
 * for reference.
 */

test('cleanNullAndUndefined removes null and undefined values', t => {
    const input = {
        model: 'llama',
        temperature: 0.7,
        seed: null,
        maxTokens: undefined,
        stream: true
    };
    
    const cleaned = cleanNullAndUndefined(input);
    
    t.is(Object.keys(cleaned).length, 3, 'Should have 3 properties');
    t.is(cleaned.model, 'llama', 'Should keep model property');
    t.is(cleaned.temperature, 0.7, 'Should keep temperature property');
    t.is(cleaned.stream, true, 'Should keep stream property');
    t.false('seed' in cleaned, 'Should not have null seed property');
    t.false('maxTokens' in cleaned, 'Should not have undefined maxTokens property');
});

test.skip('Cloudflare client does not send null parameters', t => {
    t.pass('This test has been moved to integration tests');
});
