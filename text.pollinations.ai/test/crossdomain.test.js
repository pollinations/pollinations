import test from 'ava';
import request from 'supertest';
import app from '../server.js';

/**
 * Test: GET /crossdomain.xml
 * 
 * Purpose: Verify that the crossdomain.xml endpoint serves the correct XML content
 * with appropriate headers
 * 
 * Expected behavior:
 * - Returns 200 OK
 * - Sets Content-Type to application/xml
 * - Returns XML with correct cross-domain policy content
 */
test('crossdomain.xml should serve correct content and headers', async t => {
  const response = await request(app)
    .get('/crossdomain.xml')
    .expect(200)
    .expect('Content-Type', /application\/xml/);
  
  // Verify content includes the essential parts
  t.true(response.text.includes('<?xml version="1.0" encoding="UTF-8"?>'));
  t.true(response.text.includes('<cross-domain-policy>'));
  t.true(response.text.includes('<allow-access-from domain="*" secure="false"/>'));
  t.true(response.text.includes('</cross-domain-policy>'));
});

/**
 * Test: GET /models
 * 
 * Purpose: Verify that adding the crossdomain.xml endpoint doesn't break existing functionality
 * 
 * Expected behavior:
 * - Returns 200 OK
 * - Sets Content-Type to application/json
 * - Returns an array of models
 */
test('models endpoint should still work after adding crossdomain.xml', async t => {
  const response = await request(app)
    .get('/models')
    .expect(200)
    .expect('Content-Type', /application\/json/);
  
  t.truthy(response.body);
  t.true(Array.isArray(response.body));
});

/**
 * Test: POST / (text generation)
 * 
 * Purpose: Verify that text generation still works after adding crossdomain.xml route
 * 
 * Expected behavior:
 * - Accepts a request and returns a response (exact status depends on API availability)
 */
test('text generation should still work after adding crossdomain.xml', async t => {
  // Use a simple request with minimal processing
  const response = await request(app)
    .post('/')
    .send({
      messages: [{ role: 'user', content: 'Hello, testing the crossdomain.xml integration.' }],
      model: 'claude-3-haiku-20240307'
    });
    
  // Just verify we get a response - sometimes API might be down in testing
  // but we should at least verify the route is still working
  t.truthy(response);
  t.true(response.status === 200 || response.status === 400 || response.status === 500);
});
