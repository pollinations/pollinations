import { badDomainHandler, isBadDomain, transformToOpposite, processPrompt } from '../../src/utils/BadDomainHandler.js';
import fetch from 'node-fetch';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock node-fetch
vi.mock('node-fetch');

describe('BadDomainHandler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, BAD_DOMAINS: 'bad-site.com,another-bad-site.com' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetAllMocks();
  });

  describe('isBadDomain', () => {
    it('returns false for null, undefined or empty referrers', () => {
      expect(isBadDomain(null)).toBe(false);
      expect(isBadDomain(undefined)).toBe(false);
      expect(isBadDomain('')).toBe(false);
    });

    it('returns false when BAD_DOMAINS env variable is not set', () => {
      process.env.BAD_DOMAINS = '';
      expect(isBadDomain('example.com')).toBe(false);
    });

    it('returns false for domains not in the bad domains list', () => {
      expect(isBadDomain('example.com')).toBe(false);
      expect(isBadDomain('goodsite.com')).toBe(false);
    });

    it('returns true for domains in the bad domains list', () => {
      expect(isBadDomain('bad-site.com')).toBe(true);
      expect(isBadDomain('http://bad-site.com')).toBe(true);
      expect(isBadDomain('https://bad-site.com/some/path')).toBe(true);
      expect(isBadDomain('another-bad-site.com')).toBe(true);
    });

    it('handles subdomains of bad domains correctly', () => {
      expect(isBadDomain('subdomain.bad-site.com')).toBe(true);
    });

    it('performs case-insensitive matching', () => {
      expect(isBadDomain('BAD-SITE.COM')).toBe(true);
      expect(isBadDomain('Bad-Site.Com')).toBe(true);
    });
  });

  describe('transformToOpposite', () => {
    it('transforms a prompt using the API', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('old man with clothes')
      };
      fetch.mockResolvedValue(mockResponse);

      const result = await transformToOpposite('young woman without clothes');
      expect(result).toBe('old man with clothes');
      expect(fetch).toHaveBeenCalled();
    });

    it('handles API errors gracefully', async () => {
      const originalPrompt = 'test prompt';
      fetch.mockRejectedValue(new Error('API failure'));

      const result = await transformToOpposite(originalPrompt);
      expect(result).toBe('not test prompt');
    });

    it('handles non-200 responses gracefully', async () => {
      const originalPrompt = 'test prompt';
      const mockResponse = {
        ok: false,
        status: 500
      };
      fetch.mockResolvedValue(mockResponse);

      const result = await transformToOpposite(originalPrompt);
      expect(result).toBe('not test prompt');
    });
  });

  describe('processPrompt', () => {
    it('returns original prompt for non-bad domains', async () => {
      const result = await processPrompt('test prompt', { referer: 'good-site.com' });
      expect(result.prompt).toBe('test prompt');
      expect(result.wasTransformed).toBe(false);
    });

    it('transforms the prompt for bad domains based on probability', async () => {
      // Mock Math.random to always return 0.5 (below the default threshold)
      const originalRandom = Math.random;
      Math.random = vi.fn().mockReturnValue(0.5);

      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('transformed prompt')
      };
      fetch.mockResolvedValue(mockResponse);

      const result = await processPrompt('original prompt', { referer: 'bad-site.com' });
      expect(result.prompt).toBe('transformed prompt');
      expect(result.wasTransformed).toBe(true);
      expect(result.originalPrompt).toBe('original prompt');
      
      // Restore original Math.random
      Math.random = originalRandom;
    });

    it('keeps original prompt if random number is above threshold', async () => {
      // Mock Math.random to always return 0.8 (above the default threshold)
      const originalRandom = Math.random;
      Math.random = vi.fn().mockReturnValue(0.8);

      const result = await processPrompt('original prompt', { referer: 'bad-site.com' }, null, 0.7);
      expect(result.prompt).toBe('original prompt');
      expect(result.wasTransformed).toBe(false);
      
      // Restore original Math.random
      Math.random = originalRandom;
    });

    it('extracts referrer correctly from headers', async () => {
      const headers = {
        referer: 'test-referer.com',
        origin: 'should-not-use-this.com'
      };

      // Mock isBadDomain
      const originalIsBadDomain = isBadDomain;
      const mockIsBadDomain = vi.fn().mockReturnValue(false);
      
      // Use vi.spyOn instead of global assignment
      const spy = vi.spyOn(badDomainHandler, 'isBadDomain').mockImplementation(mockIsBadDomain);

      await processPrompt('test', headers);
      
      expect(spy).toHaveBeenCalledWith('test-referer.com');
      
      // Restore original function
      spy.mockRestore();
    });

    it('uses explicit referrer over headers when provided', async () => {
      const headers = {
        referer: 'header-referer.com'
      };

      // Mock isBadDomain
      const originalIsBadDomain = isBadDomain;
      const mockIsBadDomain = vi.fn().mockReturnValue(false);
      
      // Use vi.spyOn instead of global assignment
      const spy = vi.spyOn(badDomainHandler, 'isBadDomain').mockImplementation(mockIsBadDomain);

      await processPrompt('test', headers, 'explicit-referer.com');
      
      expect(spy).toHaveBeenCalledWith('explicit-referer.com');
      
      // Restore original function
      spy.mockRestore();
    });

    it('caches results with the same parameters', async () => {
      // First call
      const result1 = await processPrompt('test prompt', { referer: 'site.com' });
      
      // Mock isBadDomain
      const mockIsBadDomain = vi.fn().mockReturnValue(false);
      
      // Use vi.spyOn instead of global assignment
      const spy = vi.spyOn(badDomainHandler, 'isBadDomain').mockImplementation(mockIsBadDomain);
      
      // Second call with same parameters should return cached result
      const result2 = await processPrompt('test prompt', { referer: 'site.com' });
      
      expect(result2).toEqual(result1); // Same object values
      expect(spy).not.toHaveBeenCalled(); // isBadDomain not called again
      
      // Restore original function
      spy.mockRestore();
    });
  });
});
