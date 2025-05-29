/**
 * Simple rate limiter for Cloudflare Workers using Cache API
 */

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

export class RateLimiter {
  private config: RateLimitConfig;
  private keyPrefix: string;

  constructor(config: RateLimitConfig, keyPrefix: string = 'rate_limit') {
    this.config = config;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Check if a request should be allowed based on rate limits
   * @param identifier Unique identifier (typically IP address)
   * @returns Promise<RateLimitResult>
   */
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const cacheKey = `${this.keyPrefix}:${identifier}`;

    try {
      // Get current request count from cache
      const cache = caches.default;
      const cached = await cache.match(cacheKey);
      
      let requestCount = 0;
      let oldestRequest = now;

      if (cached) {
        const data = await cached.json();
        // Filter out requests outside the current window
        const recentRequests = data.requests.filter((timestamp: number) => timestamp > windowStart);
        requestCount = recentRequests.length;
        oldestRequest = recentRequests.length > 0 ? Math.min(...recentRequests) : now;
      }

      // Check if limit exceeded
      if (requestCount >= this.config.maxRequests) {
        const resetTime = oldestRequest + this.config.windowMs;
        return {
          allowed: false,
          remaining: 0,
          resetTime
        };
      }

      // Add current request to the list
      const requests = cached ? 
        (await cached.json()).requests.filter((timestamp: number) => timestamp > windowStart) : 
        [];
      requests.push(now);

      // Store updated request list in cache
      const response = new Response(JSON.stringify({ requests }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Cache for the window duration
      await cache.put(cacheKey, response.clone(), {
        expirationTtl: Math.ceil(this.config.windowMs / 1000)
      });

      return {
        allowed: true,
        remaining: this.config.maxRequests - requests.length,
        resetTime: now + this.config.windowMs
      };

    } catch (error) {
      console.error('Rate limiter error:', error);
      // If rate limiter fails, allow the request (fail open)
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime: now + this.config.windowMs
      };
    }
  }

  /**
   * Create a rate limit response with appropriate headers
   * @param result Rate limit result
   * @param corsHeaders CORS headers to include
   * @returns Response with 429 status
   */
  createRateLimitResponse(result: RateLimitResult, corsHeaders: Record<string, string>): Response {
    const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
    
    return new Response(JSON.stringify({
      error: true,
      message: 'Too many requests. Please try again later.',
      retryAfter
    }), {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': this.config.maxRequests.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString()
      }
    });
  }
}

/**
 * Get client IP address from request headers
 * @param request Request object
 * @returns IP address string
 */
export function getClientIP(request: Request): string {
  // Cloudflare provides the real IP in CF-Connecting-IP header
  const cfIP = request.headers.get('CF-Connecting-IP');
  if (cfIP) return cfIP;

  // Fallback to X-Forwarded-For
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // Last resort fallback
  return request.headers.get('X-Real-IP') || 'unknown';
}

// Pre-configured rate limiters for different endpoints
export const authRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10 // 10 requests per 15 minutes for auth endpoints
}, 'auth');

export const tokenRateLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5 // 5 token generations per hour
}, 'token');

export const validateRateLimiter = new RateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 100 // 100 validations per 5 minutes
}, 'validate');
