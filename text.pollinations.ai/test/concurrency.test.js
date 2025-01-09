import test from 'ava';
import request from 'supertest';
import app from '../server.js';

test('concurrent requests should be queued with delay', async t => {
    const startTime = Date.now();
    
    // Make 5 concurrent requests
    const [res1, res2, res3, res4, res5] = await Promise.all([
        request(app).get('/test1'),
        request(app).get('/test2'),
        request(app).get('/test3'),
        request(app).get('/test4'),
        request(app).get('/test5')
    ]);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Check that responses are successful
    t.is(res1.status, 200);
    t.is(res2.status, 200);
    t.is(res3.status, 200);
    t.is(res4.status, 200);
    t.is(res5.status, 200);

    // Verify that requests took at least 8 seconds (2 seconds between each)
    t.true(duration >= 8000, 'Requests should be queued with at least 2 second delay between them');
});

test('roblox referer should bypass queue', async t => {
    const startTime = Date.now();
    
    // Make 5 concurrent requests with Roblox referer
    const [res1, res2, res3, res4, res5] = await Promise.all([
        request(app)
            .get('/test1')
            .set('Referer', 'https://www.roblox.com'),
        request(app)
            .get('/test2')
            .set('Referer', 'https://www.roblox.com'),
        request(app)
            .get('/test3')
            .set('Referer', 'https://www.roblox.com'),
        request(app)
            .get('/test4')
            .set('Referer', 'https://www.roblox.com'),
        request(app)
            .get('/test5')
            .set('Referer', 'https://www.roblox.com')
    ]);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Check that responses are successful
    t.is(res1.status, 200);
    t.is(res2.status, 200);
    t.is(res3.status, 200);
    t.is(res4.status, 200);
    t.is(res5.status, 200);

    // Verify that requests completed quickly (no queue delay)
    t.true(duration < 2000, 'Requests with Roblox referer should bypass queue and complete quickly');
});
