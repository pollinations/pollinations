import { badDomainHandler } from '../../src/utils/BadDomainHandler.js';
import fetch from 'node-fetch';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock node-fetch
vi.mock('node-fetch');

describe('BadDomainHandler', () => {
  const originalEnv = process.env;
  const originalRandom = Math.random;

  beforeEach(() => {
    process.env = { ...originalEnv, BAD_DOMAINS: 'bad-site.com,another-bad-site.com' };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    Math.random = originalRandom;
    vi.resetAllMocks();
  });

  describe('isBadDomain', () => {
    it('handles various domain scenarios correctly', () => {
      // Null, undefined, empty
      expect(badDomainHandler.isBadDomain(null)).toBe(false);
      expect(badDomainHandler.isBadDomain(undefined)).toBe(false);
      expect(badDomainHandler.isBadDomain('')).toBe(false);
      
      // Bad domains
      expect(badDomainHandler.isBadDomain('bad-site.com')).toBe(true);
      expect(badDomainHandler.isBadDomain('http://bad-site.com')).toBe(true);
      expect(badDomainHandler.isBadDomain('subdomain.bad-site.com')).toBe(true);
      expect(badDomainHandler.isBadDomain('BAD-SITE.COM')).toBe(true);
      
      // Good domains
      expect(badDomainHandler.isBadDomain('example.com')).toBe(false);
      expect(badDomainHandler.isBadDomain('goodsite.com')).toBe(false);
      
      // Empty BAD_DOMAINS
      const tempEnv = process.env.BAD_DOMAINS;
      process.env.BAD_DOMAINS = '';
      expect(badDomainHandler.isBadDomain('bad-site.com')).toBe(false);
      process.env.BAD_DOMAINS = tempEnv;
    });
  });

  describe('transformToOpposite', () => {
    it('transforms a prompt using the API', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('old man with clothes')
      };
      fetch.mockResolvedValue(mockResponse);

      const result = await badDomainHandler.transformToOpposite('young woman without clothes');
      expect(result).toBe('old man with clothes');
      expect(fetch).toHaveBeenCalled();
    });

    it('handles API errors gracefully', async () => {
      const originalPrompt = 'test prompt';
      fetch.mockRejectedValue(new Error('API failure'));

      const result = await badDomainHandler.transformToOpposite(originalPrompt);
      expect(result).toBe('not test prompt');
    });

    it('handles non-200 responses gracefully', async () => {
      const originalPrompt = 'test prompt';
      const mockResponse = {
        ok: false,
        status: 500
      };
      fetch.mockResolvedValue(mockResponse);

      const result = await badDomainHandler.transformToOpposite(originalPrompt);
      expect(result).toBe('not test prompt');
    });
  });

  describe('processPrompt', () => {
    it('handles non-bad domains correctly', async () => {
      const result = await badDomainHandler.processPrompt('test prompt', { referer: 'good-site.com' });
      expect(result.prompt).toBe('test prompt');
      expect(result.wasTransformed).toBe(false);
    });

    it('transforms prompts for bad domains when random value is low', async () => {
      // Force Math.random to return a low value (below threshold)
      Math.random = vi.fn().mockReturnValue(0.1);
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('transformed prompt')
      };
      fetch.mockResolvedValue(mockResponse);

      const result = await badDomainHandler.processPrompt('original prompt', { referer: 'bad-site.com' });
      expect(result.prompt).toBe('transformed prompt');
      expect(result.wasTransformed).toBe(true);
      expect(result.originalPrompt).toBe('original prompt');
    });

    it('keeps original prompt for bad domains when random value is high', async () => {
      // Mock the isBadDomain function to always return true for this test
      const originalIsBadDomain = badDomainHandler.isBadDomain;
      badDomainHandler.isBadDomain = () => true;
      
      // Force Math.random to return a high value (above threshold)
      Math.random = vi.fn().mockReturnValue(0.9);

      // Set a high threshold to ensure we don't transform
      const result = await badDomainHandler.processPrompt('original prompt', { referer: 'bad-site.com' }, null, 0.7);
      
      // Restore the original function
      badDomainHandler.isBadDomain = originalIsBadDomain;
      
      expect(result.prompt).toBe('original prompt');
      expect(result.wasTransformed).toBe(false);
    });

    it('uses referrer from headers correctly', async () => {
      // This is more of an integration test that checks the whole flow
      const headers = { referer: 'bad-site.com' };
      
      // Force transformation
      Math.random = vi.fn().mockReturnValue(0.1);
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('transformed prompt')
      };
      fetch.mockResolvedValue(mockResponse);
      
      const result = await badDomainHandler.processPrompt('original prompt', headers);
      expect(result.wasTransformed).toBe(true);
      expect(result.referrer).toBe('bad-site.com');
    });

    it('prioritizes explicit referrer over headers', async () => {
      // This is more of an integration test that checks the whole flow
      const headers = { referer: 'good-site.com' };
      
      // Force transformation
      Math.random = vi.fn().mockReturnValue(0.1);
      
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('transformed prompt')
      };
      fetch.mockResolvedValue(mockResponse);
      
      const result = await badDomainHandler.processPrompt('original prompt', headers, 'bad-site.com');
      expect(result.wasTransformed).toBe(true);
      expect(result.referrer).toBe('bad-site.com');
    });

    it('caches results with the same parameters', async () => {
      // First call with a non-bad domain
      const result1 = await badDomainHandler.processPrompt('test prompt', { referer: 'good-site.com' });
      
      // Count fetch calls
      const initialFetchCalls = fetch.mock.calls.length;
      
      // Second call with same parameters should return cached result
      const result2 = await badDomainHandler.processPrompt('test prompt', { referer: 'good-site.com' });
      
      expect(result2).toEqual(result1); // Same object values
      expect(fetch.mock.calls.length).toBe(initialFetchCalls); // No additional fetch calls
    });
  });
});
