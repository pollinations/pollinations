import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import fetch from 'node-fetch';
import { createServer } from 'http';
import { createAndReturnImageCached } from '../../src/createAndReturnImages.js';
import { countFluxJobs } from '../../src/availableServers.js';

// Only mock the image generation since we can't actually generate images in tests
vi.mock('../../src/createAndReturnImages.js');
vi.mock('../../src/availableServers.js');

describe('Server Integration Tests', () => {
  const PORT = 3001;
  const BASE_URL = `http://localhost:${PORT}`;
  let server;

  beforeAll(async () => {
    process.env.PORT = PORT;
    await import('../../src/index.js');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);

  afterAll(async () => {
    delete process.env.PORT;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    createAndReturnImageCached.mockResolvedValue({
      buffer: Buffer.from('fake-image'),
      maturity: 'safe'
    });
    countFluxJobs.mockReturnValue(0);
  });

  describe('CORS Headers', () => {
    it('should set CORS headers on all responses', async () => {
      const response = await fetch(`${BASE_URL}/nonexistent`);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
      expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
    }, 30000);
  });

  describe('Image Generation Endpoint', () => {
    it('should handle /prompt/text requests', async () => {
      const response = await fetch(`${BASE_URL}/prompt/test%20image`);
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
      expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      const buffer = await response.buffer();
      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(0);
    }, 30000);

    it('should handle errors in image generation', async () => {
      createAndReturnImageCached.mockRejectedValue(new Error('Generation failed'));
      const response = await fetch(`${BASE_URL}/prompt/error%20test`);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('Internal Server Error');
    }, 30000);

    it('should handle invalid endpoints', async () => {
      const response = await fetch(`${BASE_URL}/invalid`);
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe('Not Found');
    }, 30000);
  });
});
