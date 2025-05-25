/**
 * Shared authentication utilities for Pollinations services
 * This module consolidates referrer and token handling logic
 * 
 * Strategy:
 * - Frontend apps (no backend): Use referrer + IP-based queuing
 * - Backend apps: Use token authentication with no queuing
 */

/**
 * Extract referrer from request headers
 * Used for frontend app identification and analytics
 * @param {Request|Object} req - The request object (can be Cloudflare Request or Express req)
 * @returns {string|null} The referrer URL or null
 */
export function extractReferrer(req) {
  // Handle Cloudflare Workers Request
  if (req.headers && typeof req.headers.get === 'function') {
    return req.headers.get('referer') || 
           req.headers.get('origin') || 
           req.headers.get('x-forwarded-host') || 
           null;
  }
  
  // Handle Express/Node.js request
  if (req.headers && typeof req.headers === 'object') {
    return req.headers.referer || 
           req.headers.origin || 
           req.headers['x-forwarded-host'] || 
           null;
  }
  
  return null;
}

/**
 * Extract authentication token from request
 * Supports multiple token sources (NO referrer fallback)
 * @param {Request|Object} req - The request object
 * @returns {string|null} The token or null
 */
export function extractToken(req) {
  // Handle Cloudflare Workers Request
  if (req.headers && typeof req.headers.get === 'function') {
    // Check Authorization header
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    
    // Check custom header
    const customToken = req.headers.get('x-pollinations-token');
    if (customToken) {
      return customToken;
    }
    
    // Check URL query parameter
    if (req.url) {
      const url = new URL(req.url);
      const queryToken = url.searchParams.get('token');
      if (queryToken) {
        return queryToken;
      }
    }
  }
  
  // Handle Express/Node.js request
  if (req.headers && typeof req.headers === 'object') {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    
    // Check custom header
    if (req.headers['x-pollinations-token']) {
      return req.headers['x-pollinations-token'];
    }
    
    // Check query parameter
    if (req.query && req.query.token) {
      return req.query.token;
    }
  }
  
  return null;
}

/**
 * Validate token against allowed tokens
 * Simple string comparison for now
 * @param {string} token - The token to validate
 * @param {string[]|string} validTokens - Array of valid tokens or comma-separated string
 * @returns {boolean} Whether the token is valid
 */
export function isValidToken(token, validTokens) {
  if (!token) return false;
  
  // Handle comma-separated string (from env vars)
  if (typeof validTokens === 'string') {
    validTokens = validTokens.split(',').map(t => t.trim()).filter(Boolean);
  }
  
  // Simple string comparison
  return validTokens.includes(token);
}

/**
 * Check if domain is whitelisted
 * @param {string} referrer - The referrer URL to check
 * @param {string[]|string} whitelist - Array of whitelisted domains or comma-separated string
 * @returns {boolean} Whether the domain is whitelisted
 */
export function isDomainWhitelisted(referrer, whitelist) {
  if (!referrer) return false;
  
  // Handle comma-separated string (from env vars)
  if (typeof whitelist === 'string') {
    whitelist = whitelist.split(',').map(d => d.trim()).filter(Boolean);
  }
  
  try {
    const url = new URL(referrer);
    const hostname = url.hostname.toLowerCase();
    
    return whitelist.some(domain => {
      domain = domain.toLowerCase();
      // Exact match or subdomain match
      return hostname === domain || 
             hostname.endsWith('.' + domain);
    });
  } catch (e) {
    // Invalid URL
    return false;
  }
}

/**
 * Get client IP address from request
 * @param {Request|Object} req - The request object
 * @returns {string} The client IP or 'unknown'
 */
export function getClientIp(req) {
  // Handle Cloudflare Workers Request
  if (req.headers && typeof req.headers.get === 'function') {
    return req.headers.get('cf-connecting-ip') ||
           req.headers.get('x-real-ip') ||
           req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
           'unknown';
  }
  
  // Handle Express/Node.js request
  if (req.headers && typeof req.headers === 'object') {
    return req.headers['cf-connecting-ip'] ||
           req.headers['x-real-ip'] ||
           (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
           req.connection?.remoteAddress ||
           'unknown';
  }
  
  return 'unknown';
}

/**
 * Determine if request should bypass queue
 * @param {Request|Object} req - The request object
 * @param {Object} config - Configuration object
 * @param {string[]|string} config.validTokens - Valid tokens
 * @param {string[]|string} config.whitelistedDomains - Whitelisted domains
 * @returns {{shouldBypass: boolean, reason: string}} Bypass decision and reason
 */
export function shouldBypassQueue(req, config) {
  // Check for valid token first (backend apps)
  const token = extractToken(req);
  if (token && isValidToken(token, config.validTokens)) {
    return { shouldBypass: true, reason: 'valid_token' };
  }
  
  // Check for whitelisted domain (trusted frontend apps)
  const referrer = extractReferrer(req);
  if (referrer && isDomainWhitelisted(referrer, config.whitelistedDomains)) {
    return { shouldBypass: true, reason: 'whitelisted_domain' };
  }
  
  return { shouldBypass: false, reason: 'no_bypass' };
}
