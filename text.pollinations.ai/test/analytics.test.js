import test from 'ava';
import { sendToAnalytics } from '../sendToAnalytics.js';

/**
 * Test suite for analytics functionality
 */

test('sendToAnalytics should handle successful requests', async t => {
    const data = {
        model: 'test-model',
        prompt: 'test prompt',
        response: 'test response',
        ip: '127.0.0.1',
        referer: 'test-referer'
    };
    
    await t.notThrowsAsync(async () => {
        await sendToAnalytics(data);
    });
});

test('sendToAnalytics should handle missing data', async t => {
    const data = {
        model: 'test-model',
        // Missing prompt and response
        ip: '127.0.0.1'
    };
    
    await t.notThrowsAsync(async () => {
        await sendToAnalytics(data);
    });
});

test('sendToAnalytics should handle network errors', async t => {
    const data = {
        model: 'test-model',
        prompt: 'test prompt',
        response: 'test response',
        ip: 'invalid-ip', // This should cause a network error
        referer: 'test-referer'
    };
    
    await t.notThrowsAsync(async () => {
        await sendToAnalytics(data);
    }, 'Should not throw on network errors');
});

test('sendToAnalytics should handle empty data', async t => {
    await t.notThrowsAsync(async () => {
        await sendToAnalytics({});
    });
});

test('sendToAnalytics should handle null/undefined data', async t => {
    await t.notThrowsAsync(async () => {
        await sendToAnalytics(null);
        await sendToAnalytics(undefined);
    });
});

test('sendToAnalytics should handle missing request', async t => {
    const result = await sendToAnalytics(null, 'test_event');
    t.is(result, undefined);
});

test('sendToAnalytics should handle missing name', async t => {
    const mockRequest = {
        headers: {},
        query: {}
    };
    const result = await sendToAnalytics(mockRequest, null);
    t.is(result, undefined);
});

test('sendToAnalytics should handle missing credentials', async t => {
    const mockRequest = {
        headers: {},
        query: {}
    };
    const result = await sendToAnalytics(mockRequest, 'test_event');
    t.is(result, undefined);
});

test('sendToAnalytics should handle request with metadata', async t => {
    const mockRequest = {
        headers: {
            'user-agent': 'test-agent',
            'accept-language': 'en-US',
            'x-real-ip': '127.0.0.1'
        },
        query: {
            test: 'value'
        },
        method: 'GET',
        path: '/test',
        originalUrl: '/test?param=value',
        protocol: 'https',
        get: () => 'test.com'
    };
    const result = await sendToAnalytics(mockRequest, 'test_event', { custom: 'data' });
    t.is(result, undefined);
});

test('sendToAnalytics should handle request with referrer', async t => {
    const mockRequest = {
        headers: {
            referer: 'https://example.com'
        },
        query: {}
    };
    const result = await sendToAnalytics(mockRequest, 'test_event');
    t.is(result, undefined);
});

test('sendToAnalytics should handle request with body referrer', async t => {
    const mockRequest = {
        headers: {},
        body: {
            referrer: 'https://example.com'
        },
        query: {}
    };
    const result = await sendToAnalytics(mockRequest, 'test_event');
    t.is(result, undefined);
});

test('sendToAnalytics should handle request with query referrer', async t => {
    const mockRequest = {
        headers: {},
        query: {
            referrer: 'https://example.com'
        }
    };
    const result = await sendToAnalytics(mockRequest, 'test_event');
    t.is(result, undefined);
});
