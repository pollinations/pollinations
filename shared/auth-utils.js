/**
 * Shared authentication utilities for Pollinations services
 * This module consolidates referrer and token handling logic
 * 
 * Strategy:
 * - Frontend apps (no backend): Use referrer + IP-based queuing
 * - Backend apps: Use token authentication with no queuing
 * - Referrers grant extended access but fewer rights than tokens
 * 
 * Usage:
 * Services can import these utilities directly, as environment variables are loaded automatically:
 * import { extractToken, extractReferrer, shouldBypassQueue, handleAuthentication, addAuthDebugHeaders, createAuthDebugResponse } from '../shared/auth-utils.js';
 */

// Auto-load environment variables from shared and local .env files
import './env-loader.js';
import debug from 'debug';

// Set up debug loggers with namespaces
const log = debug('pollinations:auth');
const errorLog = debug('pollinations:error');
const tokenLog = debug('pollinations:auth:token');
const referrerLog = debug('pollinations:auth:referrer');

// Token field configuration for DRY principle
const TOKEN_FIELDS = {
  query: ['token'],
  header: ['authorization', 'x-pollinations-token'],
  body: ['token' ]
};

/**
 * Helper function to extract value from query parameters
 * @param {string} url - Request URL
 * @param {string[]} fields - Array of field names to check
 * @returns {Object} { value, source } or { value: null, source: null }
 */
function extractFromQuery(url, fields) {
  const urlObj = new URL(url, 'http://x');
  for (const field of fields) {
    const value = urlObj.searchParams.get(field);
    if (value) return { value, source: `query:${field}` };
  }
  return { value: null, source: null };
}

/**
 * Helper function to extract value from headers (supports both Cloudflare and Express styles)
 * @param {Object} headers - Request headers
 * @param {string[]} fields - Array of field names to check
 * @returns {Object} { value, source } or { value: null, source: null }
 */
function extractFromHeaders(headers, fields) {
  for (const field of fields) {
    let value = null;
    
    if (headers.get) { // Cloudflare-style headers
      value = headers.get(field);
    } else if (headers) { // Express-style headers
      value = headers[field] || headers[field.toLowerCase()];
    }
    
    if (value) {
      // Special handling for authorization header
      if (field === 'authorization') {
        value = value.replace(/^Bearer\s+/i, '');
      }
      return { value, source: `header:${field}` };
    }
  }
  return { value: null, source: null };
}

/**
 * Helper function to extract value from request body
 * @param {Object} body - Request body
 * @param {string[]} fields - Array of field names to check
 * @returns {Object} { value, source } or { value: null, source: null }
 */
function extractFromBody(body, fields) {
  if (!body) return { value: null, source: null };
  
  for (const field of fields) {
    const value = body[field];
    if (value) return { value, source: `body:${field}` };
  }
  return { value: null, source: null };
}

/**
 * Extract authentication token from request
 * Supports multiple token sources (NO referrer fallback)
 * Compatible with OpenAI and other LLM API authentication patterns
 * @param {Request|Object} req - The request object
 * @returns {string|null} The token or null
 */
export function extractToken(req) {
  // Check URL query parameters
  const queryResult = extractFromQuery(req.url, TOKEN_FIELDS.query);
  if (queryResult.value) return queryResult.value;
  
  // Check headers for Bearer token, API key, and custom headers
  const headerResult = extractFromHeaders(req.headers, TOKEN_FIELDS.header);
  if (headerResult.value) return headerResult.value;
  
  // Check body for token field in POST requests (multiple field names)
  if (req.method === 'POST' && req.body) {
    const bodyResult = extractFromBody(req.body, TOKEN_FIELDS.body);
    if (bodyResult.value) return bodyResult.value;
  }
  
  return null;  // header/query/body only – no referrer here!
}

/**
 * Extract referrer from request headers and body
 * Used for frontend app identification, extended access, and analytics
 * @param {Request|Object} req - The request object (can be Cloudflare Request or Express req)
 * @returns {string|null} The referrer URL or null
 */
export function extractReferrer(req) {
  // First check URL query parameters (highest priority)
  const url = req.url;
  if (url) {
    const urlObj = new URL(url, 'http://x'); // Use dummy base for relative URLs
    const queryReferrer = urlObj.searchParams.get('referrer') || 
                         urlObj.searchParams.get('referer'); // Support both spellings
    if (queryReferrer) return queryReferrer;
  }
  
  // Then check body for referrer field (second priority) - not just for POST
  if (req.body?.referrer) return String(req.body.referrer);
  if (req.body?.referer) return String(req.body.referer);
  
  // Finally check headers (lowest priority)
  // Handle Cloudflare Workers Request
  if (req.headers && typeof req.headers.get === 'function') {
    const headerReferrer = req.headers.get('referer') || 
                          req.headers.get('referrer') || // Support both spellings
                          req.headers.get('origin');
    if (headerReferrer) return headerReferrer;
  } else if (req.headers && typeof req.headers === 'object') {
    // Handle Express/Node.js request
    const headerReferrer = req.headers.referer || 
                          req.headers.referrer || // Support both spellings
                          req.headers.origin;
    if (headerReferrer) return headerReferrer;
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
  
  // Convert validTokens to array if it's a string
  const tokensArray = Array.isArray(validTokens) 
    ? validTokens 
    : (validTokens || '').split(',');
  
  // Check if token is in the array
  return tokensArray.includes(token);
}

/**
 * Determine the source of the token (header, query param, body)
 * @param {Request|Object} req - The request object
 * @returns {string} The source of the token
 */
export function getTokenSource(req) {
  const token = extractToken(req);
  if (!token) return 'unknown';

  const queryResult = extractFromQuery(req.url, TOKEN_FIELDS.query);
  if (queryResult.value === token) return queryResult.source;

  const headerResult = extractFromHeaders(req.headers, TOKEN_FIELDS.header);
  if (headerResult.value === token) return headerResult.source;

  const bodyResult = extractFromBody(req.body, TOKEN_FIELDS.body);
  if (bodyResult.value === token) return bodyResult.source;

  return 'unknown';
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
 * @returns {Promise<{userId: string, tier: string}|null>} User info if valid, null otherwise.
 */
export async function validateApiTokenDb(token) {
  const maskedToken = token && token.length > 8 ? 
    token.substring(0, 4) + '...' + token.substring(token.length - 4) : 
    token;
  
  if (!token) {
    tokenLog('validateApiTokenDb: No token provided');
    return null;
  }
  
  tokenLog('validateApiTokenDb: Starting validation for token: %s', maskedToken);
  
  try {
    const apiUrl = `https://auth.pollinations.ai/api/validate-token/${encodeURIComponent(token)}`;
    tokenLog('validateApiTokenDb: Making API call to auth.pollinations.ai');
    
    // Call the auth.pollinations.ai API to validate the token using a simple GET request
    const response = await fetch(apiUrl);
    
    tokenLog('validateApiTokenDb: API response status: %d %s', response.status, response.statusText);
    
    if (!response.ok) {
      tokenLog('validateApiTokenDb: API returned non-OK status: %d', response.status);
      return null;
    }
    
    const data = await response.json();
    tokenLog('validateApiTokenDb: API response data: %o', data);
    
    if (data && data.valid && data.userId) {
      tokenLog('validateApiTokenDb: Valid token for user: %s, tier: %s', data.userId, data.tier || 'seed');
      return {
        userId: data.userId,
        tier: data.tier || 'seed'
      };
    } else {
      tokenLog('validateApiTokenDb: Token validation failed - invalid token or missing userId');
      return null;
    }
  } catch (error) {
    tokenLog('validateApiTokenDb: Error during API call: %s', error.message);
    console.error('Error validating token with auth API:', error);
    return null;
  }
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
 * Determine if request should bypass queue
 * @param {Request|Object} req - The request object
 * @param {Object} ctx - Context object
 * @param {string[]|string} [ctx.legacyTokens] - Legacy tokens to check
 * @param {string[]|string} [ctx.allowlist] - Allowlisted domains
 * @returns {{bypass: boolean, reason: string, userId: string|null, debugInfo: Object}} Bypass decision, reason, userId if authenticated, and debug info
 * @throws {Error} If an invalid token is provided
 */
export async function shouldBypassQueue(req, { legacyTokens, allowlist }) {
  log('shouldBypassQueue called for request: %s %s', req.method, req.url);
  
  const token = extractToken(req);
  const ref   = extractReferrer(req);
  
  // Log token and referrer extraction results
  if (token) {
    tokenLog('Token extracted: %s (length: %d, source: %s)', 
             token.length > 8 ? token.substring(0, 4) + '...' + token.substring(token.length - 4) : token,
             token.length,
             getTokenSource(req));
  } else {
    tokenLog('No token provided in request');
  }
  
  if (ref) {
    referrerLog('Referrer extracted: %s', ref);
  } else {
    referrerLog('No referrer found in request');
  }
  
  // Create debug info object for headers
  const debugInfo = {
    token: token ? (token.length > 8 ? token.substring(0, 4) + '...' + token.substring(token.length - 4) : token) : null,
    referrer: ref,
    tokenSource: token ? getTokenSource(req) : null,
    legacyTokensCount: Array.isArray(legacyTokens) ? legacyTokens.length : (legacyTokens?.split(',').length || 0),
    allowlistCount: Array.isArray(allowlist) ? allowlist.length : (allowlist?.split(',').length || 0)
  };
  
  log('Auth context: legacyTokens=%d, allowlist=%d', debugInfo.legacyTokensCount, debugInfo.allowlistCount);
  
  // If a token is provided, validate it
  if (token) {
    tokenLog('Validating token: %s', debugInfo.token);
    
    // 1️⃣ Check legacy token first (fast local check)
    tokenLog('Checking against %d legacy tokens', debugInfo.legacyTokensCount);
    const legacyTokenMatch = legacyTokens.includes(token);
    if (legacyTokenMatch) {
      tokenLog('✅ Valid legacy token match found');
      debugInfo.authResult = 'LEGACY_TOKEN';
      debugInfo.legacyTokenMatch = true;
      log('Queue bypass granted: LEGACY_TOKEN');
      return { bypass:true, reason:'LEGACY_TOKEN', userId:null, debugInfo };
    }
    
    // 2️⃣ Check DB token (slower API call)
    tokenLog('Checking token against auth.pollinations.ai API');
    const tokenResult = await validateApiTokenDb(token);   // Uses auth.pollinations.ai API
    if (tokenResult && tokenResult.userId) {
      tokenLog('✅ Valid DB token found for user: %s (tier: %s)', tokenResult.userId, tokenResult.tier);
      debugInfo.authResult = 'DB_TOKEN';
      debugInfo.userId = tokenResult.userId;
      debugInfo.tier = tokenResult.tier;
      log('Queue bypass granted: DB_TOKEN for user %s (tier: %s)', tokenResult.userId, tokenResult.tier);
      return { 
        bypass: true, 
        reason: 'DB_TOKEN', 
        userId: tokenResult.userId, 
        tier: tokenResult.tier,
        debugInfo 
      };
    }
    
    // If token is provided but not valid, return error info instead of throwing
    // This prevents the server from crashing while maintaining proper error handling
    // tokenLog('❌ Invalid token provided: %s', debugInfo.token);
    // errorLog('Invalid token provided (source: %s)', debugInfo.tokenSource || 'unknown');
    // debugInfo.authResult = 'INVALID_TOKEN';
    // log('Authentication failed: INVALID_TOKEN');
    // return { 
    //   bypass: false, 
    //   reason: 'INVALID_TOKEN', 
    //   userId: null, 
    //   debugInfo,
    //   error: {
    //     message: 'Invalid token provided',
    //     status: 401,
    //     details: { debugInfo }
    //   }
    // };
  }
  
  // 3️⃣ Check for legacy token in referrer (no error thrown for invalid referrers)
  if (ref) {
    // Convert to string to handle any type safely
    const refStr = String(ref);
    referrerLog('Checking referrer for legacy token: %s', refStr);
    const legacyReferrerMatch = legacyTokens.some(t => refStr.includes(t));
    if (legacyReferrerMatch) {
      referrerLog('✅ Legacy token found in referrer: %s', refStr);
      debugInfo.authResult = 'LEGACY_REFERRER';
      debugInfo.legacyReferrerMatch = true;
      log('Queue bypass granted: LEGACY_REFERRER');
      return { bypass:true, reason:'LEGACY_REFERRER', userId:null, debugInfo };
    } else {
      referrerLog('No legacy token found in referrer');
    }
  
    // 3.5️⃣ Special check for catgpt referrer
    if (refStr.toLowerCase().includes('catgpt')) {
      referrerLog('✅ CatGPT referrer detected: %s', refStr);
      debugInfo.authResult = 'CATGPT_REFERRER';
      debugInfo.catgptMatch = true;
      log('Queue bypass granted: CATGPT_REFERRER');
      return { bypass:true, reason:'CATGPT_REFERRER', userId:null, debugInfo };
    }
  
    // 4️⃣ Check allow-listed domain
    referrerLog('Checking referrer against %d allowlisted domains', debugInfo.allowlistCount);
    const allowlistMatch = allowlist.some(d => refStr.includes(d));
    if (allowlistMatch) {
      referrerLog('✅ Referrer matches allowlisted domain: %s', refStr);
      debugInfo.authResult = 'ALLOWLIST';
      debugInfo.allowlistMatch = true;
      log('Queue bypass granted: ALLOWLIST');
      return { bypass:true, reason:'ALLOWLIST', userId:null, debugInfo };
    } else {
      referrerLog('Referrer does not match any allowlisted domain');
    }
  }
  
  // 5️⃣ default → go through queue
  log('No bypass criteria met, request will be queued');
  debugInfo.authResult = 'NONE';
  return { bypass:false, reason:'NONE', userId:null, debugInfo };
}

/**
 * Handle authentication with standardized error handling
 * This function encapsulates the common pattern of:
 * 1. Loading auth context from environment
 * 2. Calling shouldBypassQueue with error handling
 * 3. Returning structured auth result or throwing appropriate errors
 * 
 * @param {Object} req - Request object
 * @param {string} requestId - Request ID for logging
 * @param {Function} logAuth - Debug logger function
 * @returns {Promise<Object>} Authentication result with bypass, reason, userId, and debugInfo
 * @throws {Error} 401 error for invalid tokens, re-throws other errors
 */
export async function handleAuthentication(req, requestId = null, logAuth = null) {
  let hasValidToken, reason, userId, debugInfo;
  
  try {
    // Load auth context from environment
    const legacyTokens = process.env.LEGACY_TOKENS ? process.env.LEGACY_TOKENS.split(',') : [];
    const allowlist = process.env.ALLOWLISTED_DOMAINS ? process.env.ALLOWLISTED_DOMAINS.split(',') : [];
    
    // Check if request should bypass queue using shared utility
    // This may throw an error if an invalid token is provided
    const authResult = await shouldBypassQueue(req, { legacyTokens, allowlist });
    hasValidToken = authResult.bypass;
    reason = authResult.reason;
    userId = authResult.userId;
    debugInfo = authResult.debugInfo;
    
    // Log authentication information if logger provided
    if (logAuth && requestId) {
      logAuth('Authentication result:', {
        requestId,
        hasValidToken,
        reason,
        userId,
        debugInfo
      });
    }
    
    return {
      bypass: hasValidToken,
      reason,
      userId,
      tier: debugInfo.tier || 'seed',
      debugInfo
    };
    
  } catch (authError) {
    // Handle invalid token error
    if (authError.details?.debugInfo?.authResult === 'INVALID_TOKEN') {
      if (logAuth) {
        logAuth('Invalid token error:', authError.message);
        // Log the authentication error using debug
        if (requestId) {
          logAuth('Authentication error:', {
            requestId,
            error: 'INVALID_TOKEN',
            message: authError.message
          });
        }
      }
      
      // Return a 401 Unauthorized response
      const error = new Error('Invalid authentication token');
      error.status = 401;
      error.details = { authError: 'The provided token is not valid' };
      throw error;
    }
    // Re-throw other errors
    throw authError;
  }
}

/**
 * Add debug headers to response from authentication debug info
 * This centralizes the common pattern of adding X-Debug-* headers for authentication debugging
 * 
 * @param {Object} headers - Headers object to modify
 * @param {Object} debugInfo - Debug info from authentication result
 */
export function addAuthDebugHeaders(headers, debugInfo) {
  if (!debugInfo) return;
  
  if (debugInfo.authResult) {
    headers['X-Auth-Result'] = debugInfo.authResult;
  }
  
  if (debugInfo.token) {
    headers['X-Debug-Token'] = debugInfo.token;
  }
  
  if (debugInfo.tokenSource) {
    headers['X-Debug-Token-Source'] = debugInfo.tokenSource;
  }
  
  if (debugInfo.referrer) {
    headers['X-Debug-Referrer'] = 'present';
  }
  
  if (debugInfo.legacyTokenMatch) {
    headers['X-Debug-Legacy-Token-Match'] = 'true';
  }
  
  if (debugInfo.allowlistMatch) {
    headers['X-Debug-Allowlist-Match'] = 'true';
  }
}

/**
 * Create a structured debug response object from authentication debug info
 * This centralizes the common pattern of constructing debug info for error responses
 * 
 * @param {Object} debugInfo - Debug info from authentication result
 * @returns {Object|null} Structured debug object or null if no debug info
 */
export function createAuthDebugResponse(debugInfo) {
  if (!debugInfo) return null;
  
  const debug = {
    authResult: debugInfo.authResult || 'NONE'
  };
  
  // Add token info if available
  if (debugInfo.token || debugInfo.tokenSource || debugInfo.legacyTokenMatch) {
    debug.tokenInfo = {
      present: !!debugInfo.token,
      source: debugInfo.tokenSource || 'none',
      legacyMatch: !!debugInfo.legacyTokenMatch
    };
  }
  
  // Add referrer info if available
  if (debugInfo.referrer || debugInfo.allowlistMatch) {
    debug.referrerInfo = {
      present: !!debugInfo.referrer,
      allowlistMatch: !!debugInfo.allowlistMatch
    };
  }
  
  return debug;
}
