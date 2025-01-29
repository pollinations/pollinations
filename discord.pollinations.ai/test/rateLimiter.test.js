const { RateLimiter } = require('../src/utils/rateLimiter');

describe('RateLimiter', () => {
  let limiter;
  const userId = '123';

  beforeEach(() => {
    limiter = new RateLimiter(2, 1000); // 2 requests per second
  });

  test('allows requests within limit', () => {
    expect(limiter.tryRequest(userId)).toBe(true);
    expect(limiter.tryRequest(userId)).toBe(true);
  });

  test('blocks requests over limit', () => {
    expect(limiter.tryRequest(userId)).toBe(true);
    expect(limiter.tryRequest(userId)).toBe(true);
    expect(limiter.tryRequest(userId)).toBe(false);
  });

  test('resets after time window', async () => {
    expect(limiter.tryRequest(userId)).toBe(true);
    expect(limiter.tryRequest(userId)).toBe(true);
    
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    expect(limiter.tryRequest(userId)).toBe(true);
  });

  test('returns correct time until reset', () => {
    limiter.tryRequest(userId);
    const timeUntilReset = limiter.getTimeUntilReset(userId);
    expect(timeUntilReset).toBeLessThanOrEqual(1000);
    expect(timeUntilReset).toBeGreaterThan(0);
  });

  test('clears user data', () => {
    limiter.tryRequest(userId);
    limiter.clearUser(userId);
    expect(limiter.getTimeUntilReset(userId)).toBe(0);
  });
});