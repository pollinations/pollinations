import { expect, test, vi, describe, beforeEach, afterEach } from 'vitest';
import { isBadDomain, transformToOpposite } from '../../src/badDomainHandler.js';
import fetch from 'node-fetch';

// Mock node-fetch
vi.mock('node-fetch');

describe('badDomainHandler', () => {
  
  // Save original env and restore after tests
  const originalEnv = process.env;
  
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetAllMocks();
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isBadDomain', () => {
    test('returns false if referrer is empty', () => {
      expect(isBadDomain(null)).toBe(false);
      expect(isBadDomain(undefined)).toBe(false);
      expect(isBadDomain('')).toBe(false);
    });

    test('returns false if BAD_DOMAINS is not set', () => {
      delete process.env.BAD_DOMAINS;
      expect(isBadDomain('example.com')).toBe(false);
    });

    test('returns false if BAD_DOMAINS is empty', () => {
      process.env.BAD_DOMAINS = '';
      expect(isBadDomain('example.com')).toBe(false);
    });

    test('returns true if domain is in BAD_DOMAINS', () => {
      process.env.BAD_DOMAINS = 'bad-site.com,another-bad-site.com';
      expect(isBadDomain('bad-site.com')).toBe(true);
      expect(isBadDomain('http://bad-site.com')).toBe(true);
      expect(isBadDomain('https://bad-site.com/some/path')).toBe(true);
      expect(isBadDomain('another-bad-site.com')).toBe(true);
    });

    test('returns true for subdomains of BAD_DOMAINS', () => {
      process.env.BAD_DOMAINS = 'bad-site.com';
      expect(isBadDomain('subdomain.bad-site.com')).toBe(true);
      expect(isBadDomain('https://another.subdomain.bad-site.com/path')).toBe(true);
    });

    test('returns false if domain is not in BAD_DOMAINS', () => {
      process.env.BAD_DOMAINS = 'bad-site.com,another-bad-site.com';
      expect(isBadDomain('good-site.com')).toBe(false);
      expect(isBadDomain('http://good-site.com')).toBe(false);
    });

    test('handles malformed URLs gracefully', () => {
      process.env.BAD_DOMAINS = 'bad-site.com';
      expect(isBadDomain('not-a-url!')).toBe(false);
    });
  });

  describe('transformToOpposite', () => {
    test('transforms a prompt using text.pollinations.ai', async () => {
      // Mock successful response
      fetch.mockResolvedValue({
        ok: true,
        text: async () => 'transformed prompt'
      });

      const result = await transformToOpposite('original prompt');
      expect(result).toBe('transformed prompt');
      
      // Verify the correct URL was called
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://text.pollinations.ai/')
      );
    });

    test('returns "not {original}" on error', async () => {
      // Mock failed response
      fetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      const result = await transformToOpposite('original prompt');
      expect(result).toBe('not original prompt');
    });

    test('handles network errors', async () => {
      // Mock network error
      fetch.mockRejectedValue(new Error('Network error'));

      const result = await transformToOpposite('original prompt');
      expect(result).toBe('not original prompt');
    });
  });
});
