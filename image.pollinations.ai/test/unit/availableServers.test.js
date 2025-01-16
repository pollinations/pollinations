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

    it('should fetch servers from main server when none available', async () => {
      const mockServerList = [
        { url: 'http://server1:8080', type: 'flux' },
        { url: 'http://server2:8080', type: 'flux' }
      ];
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServerList)
      });

      const url = await getNextServerUrl('flux');
      expect(url).toBe('http://server1:8080');
      expect(fetch).toHaveBeenCalled();
    });

    it('should handle fetch error from main server', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(getNextServerUrl('flux')).rejects.toThrow('No active flux servers available');
    });
  });

  describe('handleRegisterEndpoint', () => {
    it('should handle POST request with valid data', () => {
      const req = {
        method: 'POST',
        on: (event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({ url: 'http://test:8080' }));
          }
          if (event === 'end') {
            callback();
          }
        }
      };
      const res = {
        writeHead: vi.fn(),
        end: vi.fn()
      };

      handleRegisterEndpoint(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      expect(res.end).toHaveBeenCalledWith(expect.stringContaining('success'));
    });

    it('should handle POST request with invalid JSON', () => {
      const req = {
        method: 'POST',
        on: (event, callback) => {
          if (event === 'data') {
            callback('invalid json');
          }
          if (event === 'end') {
            callback();
          }
        }
      };
      const res = {
        writeHead: vi.fn(),
        end: vi.fn()
      };

      handleRegisterEndpoint(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
      expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON'));
    });

    it('should handle POST request with missing url', () => {
      const req = {
        method: 'POST',
        on: (event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({ type: 'flux' }));
          }
          if (event === 'end') {
            callback();
          }
        }
      };
      const res = {
        writeHead: vi.fn(),
        end: vi.fn()
      };

      handleRegisterEndpoint(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
      expect(res.end).toHaveBeenCalledWith(expect.stringContaining('url is required'));
    });

    it('should handle GET request', () => {
      registerServer('http://test:8080', 'flux');
      
      const req = { method: 'GET' };
      const res = {
        writeHead: vi.fn(),
        end: vi.fn()
      };

      handleRegisterEndpoint(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response).toBeInstanceOf(Array);
      expect(response[0].url).toBe('http://test:8080');
    });

    it('should handle unsupported methods', () => {
      const req = { method: 'PUT' };
      const res = {
        writeHead: vi.fn(),
        end: vi.fn()
      };

      handleRegisterEndpoint(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(405, { 'Content-Type': 'application/json' });
      expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Method not allowed'));
    });
  });
});
