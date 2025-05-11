import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { Readable } from 'stream';
import { Buffer } from 'buffer';

// Mock the necessary dependencies
let server;
const mockResponseStream = () => {
  const stream = new Readable({
    read() {}
  });
  
  // Simulate the OpenAI streaming format
  setTimeout(() => {
    stream.push(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })}\n\n`);
  }, 50);
  
  setTimeout(() => {
    stream.push(`data: ${JSON.stringify({ choices: [{ delta: { content: ' world' } }] })}\n\n`);
  }, 100);
  
  setTimeout(() => {
    stream.push(`data: ${JSON.stringify({ choices: [{ delta: { content: '!' } }] })}\n\n`);
  }, 150);
  
  setTimeout(() => {
    stream.push('data: [DONE]\n\n');
    stream.push(null);
  }, 200);
  
  return stream;
};

// Mock the model handler
jest.mock('../availableModels.js', () => {
  return {
    availableModels: [{ name: 'test-model', provider: 'test' }],
    getHandler: () => async (messages, options) => {
      if (options.stream) {
        return {
          stream: true,
          responseStream: mockResponseStream(),
          model: 'test-model',
          providerName: 'test'
        };
      }
      
      return {
        model: 'test-model',
        choices: [
          {
            message: {
              content: 'Hello world!',
              role: 'assistant'
            },
            finish_reason: 'stop'
          }
        ]
      };
    }
  };
});

// Mock cache and analytics functions
jest.mock('../cache.js', () => ({
  getFromCache: () => null,
  setInCache: () => {},
  createHashKey: () => 'mock-hash-key'
}));

jest.mock('../sendToAnalytics.js', () => ({
  sendToAnalytics: () => Promise.resolve()
}));

jest.mock('../feed.js', () => ({
  setupFeedEndpoint: () => {},
  sendToFeedListeners: () => {}
}));

jest.mock('../ads/initRequestFilter.js', () => ({
  processRequestForAds: (content) => content,
  createStreamingAdWrapper: (stream) => stream
}));

describe('Streaming API Formats', () => {
  beforeAll(() => {
    server = app.listen(0);
  });

  afterAll(() => {
    server.close();
  });

  it('GET endpoint with streaming=true should return plain text stream', async () => {
    const response = await request(server)
      .get('/Hello?model=test-model&stream=true')
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding('utf8');
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          callback(null, data);
        });
      });

    // Should receive plain text without SSE format
    expect(response.text).toBe('Hello world!');
    expect(response.text).not.toContain('data:');
    expect(response.text).not.toContain('[DONE]');
    expect(response.headers['content-type']).toContain('text/plain');
  });

  it('POST endpoint with streaming=true should return OpenAI format stream', async () => {
    const response = await request(server)
      .post('/v1/chat/completions')
      .send({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      })
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding('utf8');
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          callback(null, data);
        });
      });

    // Should receive OpenAI SSE format
    expect(response.text).toContain('data:');
    expect(response.text).toContain('[DONE]');
    expect(response.headers['content-type']).toContain('text/event-stream');
  });

  it('GET endpoint without streaming should return plain text', async () => {
    const response = await request(server)
      .get('/Hello?model=test-model')
      .set('Accept', 'text/plain');

    expect(response.text).toBe('Hello world!');
    expect(response.headers['content-type']).toContain('text/plain');
  });

  it('POST endpoint without streaming should return OpenAI format JSON', async () => {
    const response = await request(server)
      .post('/v1/chat/completions')
      .send({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(response.body).toHaveProperty('choices');
    expect(response.body.choices[0].message.content).toBe('Hello world!');
    expect(response.headers['content-type']).toContain('application/json');
  });
});
