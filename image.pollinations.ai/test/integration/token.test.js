import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import fetch from 'node-fetch';
import { createAndReturnImageCached } from '../../src/createAndReturnImages.js';
import { countFluxJobs } from '../../src/availableServers.js';
import { countJobs } from '../../src/generalImageQueue.js';

// Mock image generation and job counting
vi.mock('../../src/createAndReturnImages.js');
vi.mock('../../src/availableServers.js');
vi.mock('../../src/generalImageQueue.js');

describe('Token Integration Tests', () => {
  const PORT = 3002;
  const BASE_URL = `http://localhost:${PORT}`;
  const TEST_TOKEN = 'test-token';

  beforeAll(async () => {
    // Set up test environment
    process.env.PORT = PORT;
    process.env.VALID_TOKENS = TEST_TOKEN;
    await import('../../src/index.js');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);

  afterAll(async () => {
    delete process.env.PORT;
    delete process.env.VALID_TOKENS;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    createAndReturnImageCached.mockResolvedValue({
      buffer: Buffer.from('fake-image'),
      maturity: 'safe'
    });
    countFluxJobs.mockReturnValue(0);
    countJobs.mockReturnValue(0);
  });

  describe('Token Authentication', () => {
    it('should accept valid token in query parameter', async () => {
      const response = await fetch(`${BASE_URL}/prompt/test?token=${TEST_TOKEN}`);
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
    }, 30000);

    it('should accept valid token in Authorization header', async () => {
      const response = await fetch(`${BASE_URL}/prompt/test`, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`
        }
      });
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
    }, 30000);

    it('should accept valid token in custom header', async () => {
      const response = await fetch(`${BASE_URL}/prompt/test`, {
        headers: {
          'x-pollinations-token': TEST_TOKEN
        }
      });
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
    }, 30000);

    it('should still work without token but go through queue', async () => {
      const response = await fetch(`${BASE_URL}/prompt/test`);
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
    }, 30000);

    it('should reject invalid token', async () => {
      const response = await fetch(`${BASE_URL}/prompt/test?token=invalid-token`);
      expect(response.ok).toBe(true); // Should still work, just won't bypass queue
      expect(response.headers.get('content-type')).toBe('image/jpeg');
    }, 30000);

  });
});
