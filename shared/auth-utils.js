/**
 * Shared authentication utilities for Pollinations services
 * This module consolidates referrer and token handling logic
 * 
 * Strategy:
 * - Frontend apps (no backend): Use referrer + IP-based queuing
 * - Backend apps: Use token authentication with no queuing
 * 
 * Usage:
 * Services should load their own .env file with dotenv, then import these utilities:
 * import { extractToken, extractReferrer, shouldBypassQueue } from '../shared/auth-utils.js';
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
  const q = new URL(req.url, 'http://x').searchParams.get('token');
  const hdr = req.headers.get?.('authorization')?.replace(/^Bearer\s+/i,'') ||
              req.headers.get?.('x-pollinations-token');
  return q || hdr || null;            // header/query only – no referrer here!
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
    return whitelist.some(domain => url.hostname.includes(domain));
  } catch (e) {
    // If referrer is not a valid URL, check if it includes any whitelisted domain
    return whitelist.some(domain => referrer.includes(domain));
    return false;
  }
}

/**
 * Check if a domain is allowed for a specific user in the auth database.
 * @param {string} userId - The user ID.
 * @param {string} referrer - The referrer URL to check.
 * @param {D1Database} db - The D1 Database instance.
 * @param {function} isDomainAllowedDb - The function to check domain against DB (e.g., from auth.pollinations.ai/src/db.ts).
 * @returns {Promise<boolean>} Whether the domain is allowed for the user.
 */
export async function isUserDomainAllowedFromDb(userId, referrer, db, isDomainAllowedDb) {
  if (!userId || !referrer || !db || !isDomainAllowedDb) return false;

  try {
    const url = new URL(referrer);
    const hostname = url.hostname.toLowerCase();
    return await isDomainAllowedDb(db, userId, hostname);
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
 * Get IP address from request (with privacy masking)
 * @param {Object} req - The request object
 * @returns {string} The IP address (truncated for privacy)
 */
export function getIp(req) {
  // Prioritize standard proxy headers and add cloudflare-specific headers
  const ip = req.headers["x-bb-ip"] || 
             req.headers["x-nf-client-connection-ip"] || 
             req.headers["x-real-ip"] || 
             req.headers['x-forwarded-for'] || 
             req.headers['cf-connecting-ip'] ||
             (req.socket ? req.socket.remoteAddress : null);
  
  if (!ip) return null;
  
  // Handle x-forwarded-for which can contain multiple IPs (client, proxy1, proxy2, ...)
  // The client IP is typically the first one in the list
  const cleanIp = ip.split(',')[0].trim();
  
  // Check if IPv4 or IPv6
  if (cleanIp.includes(':')) {
      // IPv6 address - take first 4 segments (64 bits) which typically represent the network prefix
      // Handle special IPv6 formats like ::1 or 2001::
      const segments = cleanIp.split(':');
      let normalizedSegments = [];
      
      // Handle :: notation (compressed zeros)
      if (cleanIp.includes('::')) {
          const parts = cleanIp.split('::');
          const leftPart = parts[0] ? parts[0].split(':') : [];
          const rightPart = parts[1] ? parts[1].split(':') : [];
          
          // Calculate how many zero segments are represented by ::
          const missingSegments = 8 - leftPart.length - rightPart.length;
          
          normalizedSegments = [
              ...leftPart,
              ...Array(missingSegments).fill('0'),
              ...rightPart
          ];
      } else {
          normalizedSegments = segments;
      }
      
      return normalizedSegments.slice(0, 4).join(':');
  } else {
      // IPv4 address - take first 3 segments
      return cleanIp.split('.').slice(0, 3).join('.');
  }
}

/**
 * Validate token against the auth.pollinations.ai API.
 * @param {string} token - The token to validate.
 * @returns {Promise<string|null>} UserId if valid, null otherwise.
 */
export async function validateApiTokenDb(token) {
  if (!token) return null;
  
  try {
    // Call the auth.pollinations.ai API to validate the token
    const response = await fetch('https://auth.pollinations.ai/api/validate-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.valid ? data.userId : null;
  } catch (error) {
    console.error('Error validating token with auth API:', error);
    return null;
  }
}

/**
 * Determine if request should bypass queue
 * @param {Request|Object} req - The request object
 * @param {Object} ctx - Context object
 * @param {string[]|string} [ctx.legacyTokens] - Legacy tokens to check
 * @param {string[]|string} [ctx.allowlist] - Allowlisted domains
 * @returns {{bypass: boolean, reason: string, userId: string|null}} Bypass decision, reason, and userId if authenticated
 */
export async function shouldBypassQueue(req, { legacyTokens, allowlist }) {
  const token = extractToken(req);
  const ref   = extractReferrer(req);
  // 1️⃣ DB token
  if (token) {
    const userId = await validateApiTokenDb(token);   // Uses auth.pollinations.ai API
    if (userId) return { bypass:true, reason:'DB_TOKEN', userId };
  }
  // 2️⃣ legacy token (header/query **or** inside referrer)
  const legacyHit = legacyTokens.includes(token) ||
                   (ref && legacyTokens.some(t => ref.includes(t)));
  if (legacyHit)  return { bypass:true, reason:'LEGACY_TOKEN', userId:null };
  // 3️⃣ allow-listed domain
  if (allowlist.some(d => ref?.includes(d)))
       return { bypass:true, reason:'ALLOWLIST', userId:null };
  // 4️⃣ default → go through queue
  return { bypass:false, reason:'NONE', userId:null };
}
