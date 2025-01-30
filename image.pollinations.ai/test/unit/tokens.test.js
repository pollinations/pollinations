import { describe, it, expect } from 'vitest';
import { extractToken, isValidToken } from '../../src/config/tokens.js';

describe('Token Authentication', () => {
  describe('isValidToken', () => {
    it('should validate known tokens', () => {
      expect(isValidToken('metimol-startup-token')).toBe(true);
    });

    it('should reject invalid tokens', () => {
      expect(isValidToken('invalid-token')).toBe(false);
      expect(isValidToken('')).toBe(false);
      expect(isValidToken(null)).toBe(false);
      expect(isValidToken(undefined)).toBe(false);
    });
  });

  describe('extractToken', () => {
    it('should extract token from query parameters', () => {
      const req = {
        url: '/prompt/test?token=test-token',
        headers: {}
      };
      expect(extractToken(req)).toBe('test-token');
    });

    it('should extract token from Authorization header', () => {
      const req = {
        url: '/prompt/test',
        headers: {
          authorization: 'Bearer test-token'
        }
      };
      expect(extractToken(req)).toBe('test-token');
    });

    it('should extract token from custom header', () => {
      const req = {
        url: '/prompt/test',
        headers: {
          'x-pollinations-token': 'test-token'
        }
      };
      expect(extractToken(req)).toBe('test-token');
    });

    it('should return null when no token is present', () => {
      const req = {
        url: '/prompt/test',
        headers: {}
      };
      expect(extractToken(req)).toBe(null);
    });

    it('should prioritize query parameter over headers', () => {
      const req = {
        url: '/prompt/test?token=query-token',
        headers: {
          authorization: 'Bearer header-token',
          'x-pollinations-token': 'custom-token'
        }
      };
      expect(extractToken(req)).toBe('query-token');
    });
  });
});