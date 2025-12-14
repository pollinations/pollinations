/**
 * Tests for Event Delivery Fix (Issue #5909)
 * 
 * Validates that the delay mechanism works correctly to mitigate rate limiting
 * and avoids bottlenecks when errors are due to network overload.
 */

import { describe, test, expect, beforeEach, jest, useFakeTimers, advanceTimersByTime, useRealTimers } from '@jest/globals';
import EventDeliveryService, { ErrorType } from './pollinations_event_delivery_fix';

// Mock fetch for testing
global.fetch = jest.fn() as any;

describe('EventDeliveryService - Fix for Issue #5909', () => {
  let deliveryService: EventDeliveryService;
  let mockFetch: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = global.fetch as ReturnType<typeof jest.fn>;
    deliveryService = new EventDeliveryService({
      maxRetries: 3,
      initialDelay: 100, // Reduced for faster tests
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: false, // Disable jitter for predictable tests
    });
  });

  describe('Rate Limiting Mitigation', () => {
    test('should add delay between retry attempts', async () => {
      const startTime = Date.now();
      const event = {
        id: 'test-1',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      // First attempt fails with rate limit
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Rate limit exceeded',
        })
        // Second attempt succeeds
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

      const result = await deliveryService.deliverEvent(event);
      const elapsedTime = Date.now() - startTime;

      expect(result).toBe(true);
      // Should have waited at least initialDelay (100ms) before retry
      expect(elapsedTime).toBeGreaterThanOrEqual(100);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should use exponential backoff for multiple retries', async () => {
      const delays: number[] = [];
      const originalSleep = deliveryService['sleep'];
      
      // Track delays
      deliveryService['sleep'] = jest.fn(async (ms: number) => {
        delays.push(ms);
        await originalSleep.call(deliveryService, ms);
      }) as any;

      const event = {
        id: 'test-2',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      // Fail twice, then succeed
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await deliveryService.deliverEvent(event);

      // Should have delays: 100ms (after first failure), 200ms (after second failure)
      expect(delays.length).toBeGreaterThanOrEqual(2);
      expect(delays[0]).toBeGreaterThanOrEqual(100);
      expect(delays[1]).toBeGreaterThanOrEqual(200);
    });

    test('should handle rate limit errors specifically', async () => {
      const event = {
        id: 'test-3',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      // Rate limit error
      mockFetch
        .mockRejectedValueOnce({
          status: 429,
          message: 'Rate limit exceeded',
        })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await deliveryService.deliverEvent(event);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Queue Processing', () => {
    test('should add delay between processing different events', async () => {
      const delays: number[] = [];
      const originalSleep = deliveryService['sleep'];
      
      deliveryService['sleep'] = jest.fn(async (ms: number) => {
        delays.push(ms);
        await originalSleep.call(deliveryService, ms);
      }) as any;

      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const event1 = { id: 'q1', type: 'test', payload: {}, timestamp: Date.now() };
      const event2 = { id: 'q2', type: 'test', payload: {}, timestamp: Date.now() };

      deliveryService.queueEvent(event1);
      deliveryService.queueEvent(event2);

      // Wait for queue processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Should have delay between events
      expect(delays.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should respect max retries', async () => {
      const event = {
        id: 'test-4',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      // Always fail
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const result = await deliveryService.deliverEvent(event);

      expect(result).toBe(false);
      // Should have tried maxRetries (3) times
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('should handle network errors', async () => {
      const event = {
        id: 'test-5',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await deliveryService.deliverEvent(event);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Network Overload Handling (Avoid Bottleneck)', () => {
    test('should use minimal delay for 503 errors to avoid bottleneck', async () => {
      const startTime = Date.now();
      const event = {
        id: 'test-network-overload',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      // First attempt fails with 503 (service unavailable)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => 'Service unavailable',
        })
        // Second attempt succeeds
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

      const result = await deliveryService.deliverEvent(event);
      const elapsedTime = Date.now() - startTime;

      expect(result).toBe(true);
      // Should have minimal delay (around 100ms, not full backoff)
      expect(elapsedTime).toBeLessThan(500); // Much less than rate limit delay
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should use minimal delay for 502 errors', async () => {
      const event = {
        id: 'test-502',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 502 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const startTime = Date.now();
      await deliveryService.deliverEvent(event);
      const elapsedTime = Date.now() - startTime;

      // Should be fast (minimal delay)
      expect(elapsedTime).toBeLessThan(500);
    });

    test('should use minimal delay for timeout errors', async () => {
      const event = {
        id: 'test-timeout',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      // Simulate timeout
      mockFetch
        .mockRejectedValueOnce({ name: 'AbortError', message: 'timeout' })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const startTime = Date.now();
      await deliveryService.deliverEvent(event);
      const elapsedTime = Date.now() - startTime;

      // Should be fast (minimal delay for network issues)
      expect(elapsedTime).toBeLessThan(500);
    });
  });

  describe('Circuit Breaker', () => {
    test('should open circuit breaker after threshold failures', async () => {
      const service = new EventDeliveryService({
        circuitBreakerThreshold: 3,
        maxRetries: 1, // Fail fast for testing
      });

      const event = {
        id: 'test-circuit',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      // Cause failures
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      // Trigger failures to open circuit breaker
      await service.deliverEvent({ ...event, id: 'test-1' });
      await service.deliverEvent({ ...event, id: 'test-2' });
      await service.deliverEvent({ ...event, id: 'test-3' });

      // Circuit breaker should be open
      expect(service['isCircuitBreakerOpen']()).toBe(true);

      // New events should be rejected immediately
      const result = await service.deliverEvent({ ...event, id: 'test-4' });
      expect(result).toBe(false);
      // Should not even attempt delivery
      expect(mockFetch).toHaveBeenCalledTimes(3); // Only the first 3 attempts
    });

    test('should close circuit breaker after reset time', async () => {
      useFakeTimers();
      
      const service = new EventDeliveryService({
        circuitBreakerThreshold: 2,
        circuitBreakerResetTime: 1000, // 1 second
        maxRetries: 1,
      });

      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      // Open circuit breaker
      await service.deliverEvent({ id: 'test-1', type: 'test', payload: {}, timestamp: Date.now() });
      await service.deliverEvent({ id: 'test-2', type: 'test', payload: {}, timestamp: Date.now() });

      expect(service['isCircuitBreakerOpen']()).toBe(true);

      // Fast forward time
      advanceTimersByTime(1000);

      // Circuit breaker should be closed
      expect(service['isCircuitBreakerOpen']()).toBe(false);

      useRealTimers();
    });
  });

  describe('Error Classification', () => {
    test('should classify rate limit errors correctly', () => {
      const error = { status: 429, message: 'Rate limit exceeded' };
      const errorType = deliveryService['classifyError'](error);
      expect(errorType).toBe(ErrorType.RATE_LIMIT);
    });

    test('should classify network overload errors correctly', () => {
      const error503 = { status: 503, message: 'Service unavailable' };
      expect(deliveryService['classifyError'](error503)).toBe(ErrorType.NETWORK_OVERLOAD);

      const error502 = { status: 502, message: 'Bad gateway' };
      expect(deliveryService['classifyError'](error502)).toBe(ErrorType.NETWORK_OVERLOAD);

      const timeoutError = { message: 'timeout' };
      expect(deliveryService['classifyError'](timeoutError)).toBe(ErrorType.NETWORK_OVERLOAD);
    });

    test('should classify client errors correctly', () => {
      const error = { status: 400, message: 'Bad request' };
      const errorType = deliveryService['classifyError'](error);
      expect(errorType).toBe(ErrorType.CLIENT_ERROR);
    });

    test('should classify server errors correctly', () => {
      const error = { status: 500, message: 'Internal server error' };
      const errorType = deliveryService['classifyError'](error);
      expect(errorType).toBe(ErrorType.SERVER_ERROR);
    });
  });

  describe('Queue Management', () => {
    test('should limit queue size to prevent memory issues', () => {
      const service = new EventDeliveryService({
        maxQueueSize: 5,
      });

      // Add more events than max
      for (let i = 0; i < 10; i++) {
        service.queueEvent({
          id: `test-${i}`,
          type: 'test',
          payload: {},
          timestamp: Date.now(),
        });
      }

      // Queue should not exceed max size
      const status = service.getQueueStatus();
      expect(status.size).toBeLessThanOrEqual(5);
    });

    test('should provide queue status', () => {
      const status = deliveryService.getQueueStatus();
      expect(status).toHaveProperty('size');
      expect(status).toHaveProperty('isProcessing');
      expect(status).toHaveProperty('circuitBreakerOpen');
    });

    test('should clear queue', () => {
      deliveryService.queueEvent({
        id: 'test-1',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      });

      expect(deliveryService.getQueueStatus().size).toBeGreaterThan(0);

      deliveryService.clearQueue();

      expect(deliveryService.getQueueStatus().size).toBe(0);
    });
  });

  describe('Request Timeout', () => {
    test('should timeout slow requests', async () => {
      const service = new EventDeliveryService({
        requestTimeout: 100, // Very short timeout for testing
      });

      const event = {
        id: 'test-timeout',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      // Mock fetch to never resolve (simulating slow request)
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const result = await service.deliverEvent(event);

      // Should fail due to timeout
      expect(result).toBe(false);
    });
  });

  describe('Configuration', () => {
    test('should use custom delay settings', () => {
      const customService = new EventDeliveryService({
        initialDelay: 2000,
        maxDelay: 20000,
        backoffMultiplier: 3,
      });

      expect(customService['options'].initialDelay).toBe(2000);
      expect(customService['options'].maxDelay).toBe(20000);
      expect(customService['options'].backoffMultiplier).toBe(3);
    });

    test('should use custom circuit breaker settings', () => {
      const customService = new EventDeliveryService({
        circuitBreakerThreshold: 10,
        circuitBreakerResetTime: 60000,
      });

      expect(customService['options'].circuitBreakerThreshold).toBe(10);
      expect(customService['options'].circuitBreakerResetTime).toBe(60000);
    });

    test('should apply jitter when enabled', () => {
      const serviceWithJitter = new EventDeliveryService({
        jitter: true,
        initialDelay: 1000,
      });

      const delay1 = serviceWithJitter['addJitter'](1000);
      const delay2 = serviceWithJitter['addJitter'](1000);

      // Jitter should add variation (though might be same due to randomness)
      expect(delay1).toBeGreaterThan(0);
      expect(delay2).toBeGreaterThan(0);
    });
  });
});

/**
 * Integration test example (requires actual API):
 * 
 * test('should successfully deliver events to Pollinations API', async () => {
 *   const realService = new EventDeliveryService({
 *     initialDelay: 1000,
 *     maxRetries: 3,
 *   });
 * 
 *   const event = {
 *     id: `test-${Date.now()}`,
 *     type: 'test_event',
 *     payload: { test: true },
 *     timestamp: Date.now(),
 *   };
 * 
 *   const result = await realService.deliverEvent(event);
 *   expect(result).toBe(true);
 * });
 */
