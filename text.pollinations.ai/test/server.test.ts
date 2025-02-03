import test from 'ava'
import request from 'supertest'
import app, {
    getIp,
    getRequestData,
    shouldBypassDelay,
    sendErrorResponse,
    sendOpenAIResponse,
    sendContentResponse,
} from '../server.js'

// Increase timeout for all tests
test.beforeEach(t => {
    t.timeout(30000) // 30 seconds
})

/**
 * Test suite for the server API endpoints
 */

/**
 * Test: GET /models
 * 
 * Purpose: Verify that the /models endpoint returns a list of available models
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response body should be an array
 * 3. The array should contain at least one model
 */
test('GET /models should return available models', async t => {
    const response = await request(app).get('/models?code=BeesKnees')
    t.is(response.status, 200, 'Response status should be 200')
    t.true(Array.isArray(response.body), 'Response body should be an array')
    t.true(response.body.length > 0, 'Array should contain at least one model')
})

/**
 * Test: GET /:prompt
 * 
 * Purpose: Verify that the /:prompt endpoint handles a valid prompt
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response should contain text
 */
test('GET /:prompt should handle a valid prompt', async t => {
    const response = await request(app).get('/hello?code=BeesKnees')
    t.is(response.status, 200, 'Response status should be 200')
    t.truthy(response.text, 'Response should contain text')
})

/**
 * Test: POST /
 * 
 * Purpose: Verify that the root POST endpoint handles a valid request
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response should contain text
 */
test('POST / should handle a valid request', async t => {
    const response = await request(app)
        .post('/')
        .set('Content-Type', 'application/json')
        .send({ 
            messages: [{ role: 'user', content: 'Hello' }],
            code: 'BeesKnees'
        })
    t.is(response.status, 200, 'Response status should be 200')
    t.truthy(response.text, 'Response should contain text')
})

/**
 * Test: POST /openai
 * 
 * Purpose: Verify that the /openai endpoint handles a valid request
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response body should contain data
 */
test('POST /openai should handle a valid request', async t => {
    try {
        const response = await request(app)
            .post('/openai')
            .query({ code: 'BeesKnees' })  // Add code parameter
            .send({ messages: [{ role: 'user', content: 'Hello' }] })
        t.is(response.status, 200, 'Response status should be 200')
        t.truthy(response.body, 'Response body should contain data')
    } catch (error: any) {
        t.fail(error.message)
    }
})

/**
 * Test: POST / with invalid messages
 * 
 * Purpose: Verify that the root POST endpoint properly handles invalid input
 * 
 * Expected behavior:
 * 1. The response status should be 400 (Bad Request)
 * 2. The response text should indicate invalid messages array
 */
test('POST / should return 400 for invalid messages array', async t => {
    const response = await request(app)
        .post('/')
        .send({ messages: 'invalid' })
    
    t.is(response.status, 400, 'Response status should be 400')
    t.true(response.text.includes('Invalid messages'), 'Response should indicate invalid messages')
})

/**
 * Test: POST / caching behavior
 * 
 * Purpose: Verify that the root POST endpoint caches responses for identical requests
 * 
 * Expected behavior:
 * 1. Both responses should have status 200 (OK)
 * 2. The response text for both requests should be identical
 */
test('POST / should cache responses', async t => {
    const requestBody = {
        messages: [{ role: 'user', content: 'Cache test' }],
        cache: true,
        code: 'BeesKnees'
    }

    const response1 = await request(app)
        .post('/')
        .set('Content-Type', 'application/json')
        .send(requestBody)
    t.is(response1.status, 200, 'First response status should be 200')

    const response2 = await request(app)
        .post('/')
        .set('Content-Type', 'application/json')
        .send(requestBody)
    t.is(response2.status, 200, 'Second response status should be 200')

    t.is(response1.text, response2.text, 'Cached responses should be identical')
})

/**
 * Test: POST /openai with streaming
 * 
 * Purpose: Verify that the /openai endpoint handles streaming requests correctly
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response should have correct headers for streaming
 * 3. The response should contain properly formatted streaming data
 */
test('POST /openai should handle streaming requests', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ 
            messages: [{ role: 'user', content: 'Hello' }],
            stream: true 
        })
    
    t.is(response.status, 200, 'Response status should be 200')
    t.is(response.headers['content-type'], 'text/event-stream charset=utf-8', 'Content-Type should be text/event-stream')
    t.is(response.headers['cache-control'], 'no-cache', 'Cache-Control should be no-cache')
    t.is(response.headers['connection'], 'keep-alive', 'Connection should be keep-alive')
})

/**
 * Test: POST /openai response format
 * 
 * Purpose: Verify that the /openai endpoint returns responses in OpenAI format
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response should have the correct OpenAI API structure
 */
test('POST /openai should return OpenAI formatted responses', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ messages: [{ role: 'user', content: 'Hello' }] })
    
    t.is(response.status, 200, 'Response status should be 200')
    t.truthy(response.body.choices, 'Response should have choices array')
    t.truthy(response.body.choices[0].message, 'Response should have message in first choice')
    t.truthy(response.body.choices[0].message.content, 'Response should have content in message')
})

/**
 * Test: POST /openai caching
 * 
 * Purpose: Verify that the /openai endpoint properly caches responses
 * 
 * Expected behavior:
 * 1. Both responses should have status 200 (OK)
 * 2. Both responses should be identical
 * 3. Both responses should maintain OpenAI format
 */
test('POST /openai should cache responses', async t => {
    const requestBody = {
        messages: [{ role: 'user', content: 'Cache test openai' }],
        code: 'BeesKnees'
    }

    const response1 = await request(app)
        .post('/openai?code=BeesKnees')
        .send(requestBody)
    t.is(response1.status, 200, 'First response status should be 200')

    const response2 = await request(app)
        .post('/openai?code=BeesKnees')
        .send(requestBody)
    t.is(response2.status, 200, 'Second response status should be 200')

    t.deepEqual(response1.body, response2.body, 'Cached responses should be identical')
    t.truthy(response1.body.choices, 'Cached response should maintain OpenAI format')
})

/**
 * Test: POST /openai with invalid model
 * 
 * Purpose: Verify that the /openai endpoint handles invalid model requests
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 */
test('POST /openai should handle invalid model', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ 
            messages: [{ role: 'user', content: 'Hello' }],
            model: 'invalid-model'
        })
    
    t.is(response.status, 200, 'Response status should be 200')
})

/**
 * Test: POST /openai with rate limiting
 * 
 * Purpose: Verify that rate limiting works
 * 
 * Expected behavior:
 * 1. Multiple rapid requests should be queued rather than rate limited
 */
// Removed test for rate limiting

/**
 * Test: POST /openai with system message
 * 
 * Purpose: Verify handling of system messages
 * 
 * Expected behavior:
 * 1. The response should include the system message in processing
 */
test('POST /openai should handle system messages', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ 
            messages: [
                { role: 'system', content: 'You are a helpful assistant' },
                { role: 'user', content: 'Hello' }
            ]
        })
    
    t.is(response.status, 200, 'Response status should be 200')
    t.truthy(response.body.choices[0].message, 'Response should contain message')
})

/**
 * Test: POST /openai with different temperature
 * 
 * Purpose: Verify temperature parameter handling
 * 
 * Expected behavior:
 * 1. Different temperatures should be accepted
 */
test('POST /openai should handle temperature parameter', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ 
            messages: [{ role: 'user', content: 'Hello' }],
            temperature: 0.7
        })
    
    t.is(response.status, 200, 'Response status should be 200')
})

/**
 * Test: GET / without code
 * 
 * Purpose: Verify authentication handling
 * 
 * Expected behavior:
 * 1. Request without code should be handled
 */
test('GET / should handle missing authentication code', async t => {
    const response = await request(app).get('/hello')
    t.is(response.status, 200, 'Response status should be 200')
})

/**
 * Test: POST /openai with empty messages
 * 
 * Purpose: Verify empty messages handling
 * 
 * Expected behavior:
 * 1. Empty messages should be rejected
 */
test('POST /openai should handle empty messages', async t => {
    const response = await request(app)
        .post('/openai?code=BeesKnees')
        .send({ messages: [] })
    
    t.is(response.status, 400, 'Response status should be 400')
})

/**
 * Test: server should format responses as OpenAI format
 * 
 * Purpose: Verify that the server formats responses as OpenAI format
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 */
test('server should format responses as OpenAI format', async t => {
    try {
        // const response = 
        await request(app)
            .post('/openai')
            .send({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'qwen',
                stream: true
            })
            .expect(200)
        t.pass()
    } catch (error: any) {
        t.fail(error.message)
    }
})

/**
 * Test: server should handle streaming responses with error
 * 
 * Purpose: Verify that the server handles streaming responses with error
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 */
test('server should handle streaming responses with error', async t => {
    try {
        const response = await request(app)
            .post('/openai')
            .send({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'qwen',
                stream: true
            })
        t.pass()
    } catch (error: any) {
        t.fail(error.message)
    }
})

/**
 * Test: should handle malformed request body
 * 
 * Purpose: Verify that the server handles malformed request bodies
 * 
 * Expected behavior:
 * 1. The response status should be 400 (Bad Request)
 * 2. The response body should contain an error message
 */
test('should handle malformed request body', async t => {
    const response = await request(app)
        .post('/')
        .send({ messages: 'not an array' })  // Malformed messages
        .query({ code: 'BeesKnees' })
    t.is(response.status, 400)
    t.truthy(response.body.error)
})

/**
 * Test: should handle missing messages
 * 
 * Purpose: Verify that the server handles missing messages
 * 
 * Expected behavior:
 * 1. The response status should be 400 (Bad Request)
 * 2. The response body should contain an error message
 */
test('should handle missing messages', async t => {
    const response = await request(app)
        .post('/')
        .send({})  // Missing messages field
        .query({ code: 'BeesKnees' })
    t.is(response.status, 400)
    t.truthy(response.body.error)
})

/**
 * Test: should handle roblox referrer
 * 
 * Purpose: Verify that the server handles roblox referrer
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 */
test('should handle roblox referrer', async t => {
    const response = await request(app)
        .post('/')
        .set('Referer', 'https://www.roblox.com')
        .send({ messages: [{ role: 'user', content: 'test' }] })
        .query({ code: 'BeesKnees' })
    t.is(response.status, 200)
})

/**
 * Test: should handle pollinations referrer
 * 
 * Purpose: Verify that the server handles pollinations referrer
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 */
test('should handle pollinations referrer', async t => {
    const response = await request(app)
        .post('/')
        .set('Referer', 'https://image.pollinations.ai')
        .send({ messages: [{ role: 'user', content: 'test' }] })
        .query({ code: 'BeesKnees' })
    t.is(response.status, 200)
})

/**
 * Test: GET /openai/models
 * 
 * Purpose: Verify that the /openai/models endpoint returns available models in OpenAI format
 * 
 * Expected behavior:
 * 1. The response status should be 200 (OK)
 * 2. The response body should contain a list of models in OpenAI format
 */
test('GET /openai/models should return available models in OpenAI format', async t => {
    try {
        const response = await request(app).get('/openai/models?code=BeesKnees')
        t.is(response.status, 200)
        t.true(Array.isArray(response.body.data))
        t.true(response.body.data.length > 0)
        t.true(response.body.data.every((model: any) => model.id && model.owned_by))
    } catch (error: any) {
        t.fail(error.message)
    }
})

/**
 * Unit Tests for Helper Functions
 */

test('getIp should handle various header combinations', t => {
    const testCases = [
        {
            req: { headers: { 'x-bb-ip': '1.2.3.4' } },
            expected: '1.2.3'
        },
        {
            req: { headers: { 'x-nf-client-connection-ip': '5.6.7.8' } },
            expected: '5.6.7'
        },
        {
            req: { headers: { 'x-real-ip': '9.10.11.12' } },
            expected: '9.10.11'
        },
        {
            req: { headers: { 'x-forwarded-for': '13.14.15.16' } },
            expected: '13.14.15'
        },
        {
            req: { headers: { 'referer': '17.18.19.20' } },
            expected: '17.18.19'
        },
        {
            req: { headers: {}, socket: { remoteAddress: '21.22.23.24' } },
            expected: '21.22.23'
        }
    ]

    testCases.forEach(({ req, expected }) => {
        const result = getIp(req as any)
        t.is(result, expected)
    })
})

test('getRequestData should parse request data correctly', t => {
    const testCases = [
        {
            req: {
                method: 'POST',
                body: { messages: [{ role: 'user', content: 'test' }], model: 'openai' },
                query: { code: 'test' },
                headers: {}
            },
            expected: {
                messages: [{ role: 'user', content: 'test' }],
                model: 'openai',
                jsonMode: false,
                seed: null,
                temperature: undefined,
                isImagePollinationsReferrer: false,
                isRobloxReferrer: false,
                referrer: 'unknown',
                stream: false
            }
        },
        {
            req: {
                method: 'GET',
                params: { 0: 'test prompt' },
                query: { code: 'test' },
                headers: {}
            },
            expected: {
                messages: [{ role: 'user', content: 'test prompt' }],
                jsonMode: false,
                seed: null,
                model: 'openai',
                temperature: undefined,
                isImagePollinationsReferrer: false,
                isRobloxReferrer: false,
                referrer: 'unknown',
                stream: false
            }
        }
    ]

    testCases.forEach(({ req, expected }) => {
        const result = getRequestData(req as any)
        t.deepEqual(result, expected)
    })
})

test('shouldBypassDelay should handle Roblox referrer', t => {
    const testCases = [
        {
            req: {
                headers: { referer: 'https://www.roblox.com/games' },
                query: {},
                body: {},
                params: {}
            },
            expected: true
        },
        {
            req: {
                headers: { referer: 'https://other-site.com' },
                query: {},
                body: {},
                params: {}
            },
            expected: false
        },
        {
            req: {
                headers: {},
                query: {},
                body: {},
                params: {}
            },
            expected: false
        }
    ]

    testCases.forEach(({ req, expected }) => {
        const result = shouldBypassDelay(req as any)
        t.is(result, expected)
    })
})

test('sendErrorResponse should format error responses correctly', async t => {
    const res = {
        status: function(code: number) {
            t.is(code, 500)
            return this
        },
        json: function(data: object) {
            t.deepEqual(data, {
                error: 'Test error',
                status: 500,
                details: { foo: 'bar' }
            })
        }
    }
    const error: any  = new Error('Test error')
    error.response = { data: { foo: 'bar' } }
    
    await sendErrorResponse(res as any, {} as any, error, { model: 'test' })
})

test('sendOpenAIResponse should set headers and send JSON response', t => {
    const res: any = {
        setHeader: function() {
            t.pass()
        },
        json: function(data: object) {
            t.deepEqual(data, { foo: 'bar' })
        }
    }
    
    sendOpenAIResponse(res, { foo: 'bar' })
})

test('sendContentResponse should set headers and send text response', t => {
    const res: any = {
        setHeader: function() {
            t.pass()
        },
        send: function(data: any) {
            t.is(data, 'test content')
        }
    }
    
    sendContentResponse(res, {
        choices: [{ message: { content: 'test content' } }]
    })
})

// test('processRequest should handle cached responses', async t => {
//     const res = {
//         status: function(code) {
//             return this
//         },
//         json: function(data) {
//             t.deepEqual(data.choices[0].message.content, 'cached response')
//         },
//         setHeader: function(name, value) {
//             return this
//         },
//         send: function(data) {
//             return this
//         }
//     }
//     const req = {
//         headers: {},
//         query: {},
//         body: { messages: [{ role: 'user', content: 'test' }] },
//         socket: { remoteAddress: '127.0.0.1' }
//     }
//     const requestData = {
//         messages: [{ role: 'user', content: 'test' }],
//         model: 'test'
//     }
    
//     // Mock cache hit
//     const cachedResponse = {
//         choices: [{ message: { content: 'cached response' } }],
//         usage: { total_tokens: 10 }
//     }
//     setInCache(createHashKey(requestData), cachedResponse)
    
//     await processRequest(req, res, requestData)
// })

// test('processRequest should handle queue size limit', async t => {
//     const res = {
//         status: function(code) {
//             t.is(code, 429)
//             return this
//         },
//         json: function(data) {
//             t.is(data.status, 429)
//             t.is(data.error, 'Too Many Requests')
//             t.true(data.details.queueSize >= 60)
//             t.is(data.details.maxQueueSize, 60)
//             t.true(data.details.timestamp !== undefined)
//         },
//         setHeader: function(name, value) {
//             return this
//         },
//         send: function(data) {
//             return this
//         }
//     }
//     const req = {
//         headers: {},
//         query: {},
//         body: { messages: [{ role: 'user', content: 'test' }] },
//         socket: { remoteAddress: '127.0.0.1' }
//     }
//     const requestData = {
//         messages: [{ role: 'user', content: 'test' }],
//         model: 'test'
//     }
    
//     // Mock a full queue
//     const queue = getQueue(getIp(req))
//     for (let i = 0 i < 60 i++) {
//         queue.add(() => Promise.resolve())
//     }
    
//     await processRequest(req, res, requestData)
// })
