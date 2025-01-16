import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerServer, getNextServerUrl, countJobs, handleRegisterEndpoint } from '../../src/availableServers.js';
import fetch from 'node-fetch';

vi.mock('node-fetch');
vi.mock('debug', () => ({
  default: () => vi.fn()
}));

describe('availableServers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();  
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  describe('registerServer', () => {
    it('should register a new server', () => {
      registerServer('http://test-server:8080');
      return getNextServerUrl('flux').then(url => {
        expect(url).toBe('http://test-server:8080');
      });
    });

    it('should update heartbeat for existing server', async () => {
      registerServer('http://test-server:8080');
      vi.advanceTimersByTime(1000);
      registerServer('http://test-server:8080');
      const url = await getNextServerUrl('flux');
      expect(url).toBe('http://test-server:8080');
    });

    it('should handle unknown server type', () => {
      registerServer('http://test-server:8080', 'unknown-type');
      return getNextServerUrl('flux').then(url => {
        expect(url).toBe('http://test-server:8080');
      });
    });
  });

  describe('countJobs', () => {
    it('should count jobs for a specific type', () => {
      registerServer('http://test-server:8080', 'flux');
      registerServer('http://test-server:8081', 'flux');
      expect(countJobs('flux')).toBe(0);
    });

    it('should handle unknown type', () => {
      expect(countJobs('unknown-type')).toBe(0);
    });
  });

  describe('getNextServerUrl', () => {
    beforeEach(() => {
      fetch.mockReset();
    });

    it('should throw error when no servers available', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(getNextServerUrl('nonexistent')).rejects.toThrow('No active nonexistent servers available');
    });
  });
});
