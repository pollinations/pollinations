import { Env } from './image-worker';

const RATE_LIMIT = {
  TOKENS: 40,
  INTERVAL: 60, // seconds
};

export async function rateLimit(request: Request, env: Env): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip) {
    throw new Error('Could not determine client IP');
  }

  const key = `rate_limit:${ip}`;
  const now = Date.now();
  const windowStart = now - (RATE_LIMIT.INTERVAL * 1000);

  // Get current usage from R2
  const usage = await env.STORAGE.get(key);
  const currentUsage = usage ? JSON.parse(await usage.text()) : { requests: [], tokens: 0 };

  // Clean up old requests
  currentUsage.requests = currentUsage.requests.filter((timestamp: number) => timestamp > windowStart);

  // Check if rate limit exceeded
  if (currentUsage.requests.length >= RATE_LIMIT.TOKENS) {
    throw new Error('Rate limit exceeded');
  }

  // Add new request
  currentUsage.requests.push(now);
  currentUsage.tokens = currentUsage.requests.length;

  // Store updated usage
  await env.STORAGE.put(key, JSON.stringify(currentUsage), {
    expirationTtl: RATE_LIMIT.INTERVAL
  });
}