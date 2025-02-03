import test from 'ava'
import request from 'supertest'
import app from '../server.js'

// Set timeout to 30 seconds for all tests
test.beforeEach(t => {
    t.timeout(30000) // 30 seconds
})

test('concurrent requests should be queued with delay', async t => {
    const startTime = Date.now()
    
    // Make 5 concurrent requests
    const [res1, res2, res3] = await Promise.all([
        request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .send({ messages: [{ role: 'user', content: 'test1' }] }),
        request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .send({ messages: [{ role: 'user', content: 'test2' }] }),
        request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .send({ messages: [{ role: 'user', content: 'test3' }] }),
    ])

    const endTime = Date.now()
    const duration = endTime - startTime

    // Check that responses are successful
    t.is(res1.status, 200)
    t.is(res2.status, 200)
    t.is(res3.status, 200)

    // Verify that requests took at least 20 seconds (5 seconds between each)
    t.true(duration >= 6000, 'Requests should be queued with at least 5 second delay between them')
})

test('roblox referer should bypass queue', async t => {
    const startTime = Date.now()
    
    // Make 3 concurrent requests with Roblox referer
    const [res1, res2, res3] = await Promise.all([
        request(app)
            .post('/')
            .set('Referer', 'https://www.roblox.com')
            .set('Content-Type', 'application/json')
            .send({ messages: [{ role: 'user', content: 'test1' }] }),
        request(app)
            .post('/')
            .set('Referer', 'https://www.roblox.com')
            .set('Content-Type', 'application/json')
            .send({ messages: [{ role: 'user', content: 'test2' }] }),
        request(app)
            .post('/')
            .set('Referer', 'https://www.roblox.com')
            .set('Content-Type', 'application/json')
            .send({ messages: [{ role: 'user', content: 'test3' }] })
    ])

    const endTime = Date.now()
    const duration = endTime - startTime

    // Check that responses are successful
    t.is(res1.status, 200)
    t.is(res2.status, 200)
    t.is(res3.status, 200)

    // Verify that requests completed quickly (no queue delay)
    t.true(duration < 5000, 'Requests with Roblox referer should bypass queue and complete quickly')
})

test('concurrent error requests should not block the queue', async t => {
    const startTime = Date.now()
    
    // Make concurrent requests including invalid ones
    const results = await Promise.allSettled([
        request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .send({ messages: [{ role: 'user', content: 'test1' }] }),
        request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .send({ invalid: 'request' }),
        request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .send({ messages: [] })
    ])

    const endTime = Date.now()
    const duration = endTime - startTime

    // Check that some requests failed but didn't block others
    t.true(results.some(r => r?.status === 'fulfilled'), 'Some requests should succeed')
    t.true(results.some(r => r?.status === 'rejected'), 'Some requests should fail')
    
    // Valid requests should still be processed with normal queue timing
    t.true(duration >= 5000, 'Queue timing should be maintained for valid requests')
})

test('concurrent cache hits should return consistent results', async t => {
    // First request to populate cache
    const initial = await request(app)
        .get('/prompt/cached_test')
        // .set('Content-Type', 'application/json')
        // .send({ messages: [{ role: 'user', content: 'cached_test' }] })
    t.is(initial.status, 200)

    const startTime = Date.now()
    
    // Make concurrent requests with same messages (should hit cache)
    const [res1, res2] = await Promise.all([
        request(app)
            .get('/prompt/cached_test'),
            // .set('Content-Type', 'application/json')
            // .send({ messages: [{ role: 'user', content: 'cached_test' }] }),
        request(app)
            .get('/prompt/cached_test')
            // .set('Content-Type', 'application/json')
            // .send({ messages: [{ role: 'user', content: 'cached_test' }] })
    ])

    const endTime = Date.now()
    const duration = endTime - startTime

    // Check responses
    t.is(res1.status, 200)
    t.is(res2.status, 200)

    // Cached responses should return immediately (no queue)
    t.true(duration < 1000, 'Cached requests should return immediately')
    
    // Responses should be identical since they're cached
    t.is(res1.text, res2.text)
    t.is(res1.text, initial.text, 'Cached response should match initial response')
})
