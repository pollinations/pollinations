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
import { extractFromHeaders, extractReferrer, getTokenSource, extractFromQuery, extractFromBody, extractToken, TOKEN_FIELDS } from './extractFromRequest.js';

// Set up debug loggers with namespaces
const log = debug('pollinations:auth');
const errorLog = debug('pollinations:error');
const tokenLog = debug('pollinations:auth:token');
const referrerLog = debug('pollinations:auth:referrer');

// Extract authentication token from request
// This function has been moved to extractFromRequest.js
// and is now imported at the top of this file

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
 * Check if a referrer domain is registered by any user in the auth.pollinations.ai database
 * @param {string} referrer - The referrer URL to check
 * @returns {Promise<{userId: string, username: string, tier: string}|null>} User info if domain is registered, null otherwise
 */
export async function checkReferrerInDb(referrer) {
  if (!referrer) return null;
  
  try {
    // Extract domain from referrer URL if it's a full URL
    let domain = referrer;
    if (referrer.startsWith('http://') || referrer.startsWith('https://')) {
      try {
        const urlObj = new URL(referrer);
        domain = urlObj.hostname;
      } catch (error) {
        // If parsing fails, use the raw referrer value
        referrerLog('Failed to parse referrer as URL, using raw value:', error);
      }
    }
    
    referrerLog(`Checking if domain ${domain} is registered in auth.pollinations.ai database`);
    
    // Query the auth.pollinations.ai API to check if the domain is registered by any user
    const apiUrl = `https://auth.pollinations.ai/api/validate-referrer?referrer=${encodeURIComponent(domain)}`;
    referrerLog(`Calling API: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
      referrerLog(`API returned error status: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    referrerLog('API response:', data);
    
    if (data && data.valid && data.user_id) {
      referrerLog(`✅ Domain ${domain} is registered by user ${data.user_id} (${data.username}) with tier ${data.tier}`);
      return {
        userId: data.user_id,
        username: data.username,
        tier: data.tier
      };
    } else {
      referrerLog(`❌ Domain ${domain} is not registered in the database`);
      return null;
    }
  } catch (error) {
    referrerLog('Error checking referrer in database:', error);
    return null;
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
 * Determine if request is authenticated
 * @param {Request|Object} req - The request object
 * @param {Object} ctx - Context object
 * @param {string[]|string} [ctx.legacyTokens] - Legacy tokens to check
 * @param {string[]|string} [ctx.allowlist] - Allowlisted domains
 * @returns {{authenticated: boolean, tokenAuth: boolean, referrerAuth: boolean, bypass: boolean, reason: string, userId: string|null, debugInfo: Object}} Authentication status, auth type, reason, userId if authenticated, and debug info
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
      log('Authentication succeeded: LEGACY_TOKEN');
      return { 
        bypass: true, // Kept for backward compatibility
        authenticated: true, 
        tokenAuth: true, 
        referrerAuth: false,
        reason: 'LEGACY_TOKEN', 
        userId: null, 
        debugInfo 
      };
    }
    
    // 2️⃣ Check DB token (slower API call)
    tokenLog('Checking token against auth.pollinations.ai API');
    const tokenResult = await validateApiTokenDb(token);   // Uses auth.pollinations.ai API
    if (tokenResult && tokenResult.userId) {
      tokenLog('✅ Valid DB token found for user: %s (tier: %s)', tokenResult.userId, tokenResult.tier);
      debugInfo.authResult = 'DB_TOKEN';
      debugInfo.userId = tokenResult.userId;
      debugInfo.tier = tokenResult.tier;
      log('Authentication succeeded: DB_TOKEN for user %s (tier: %s)', tokenResult.userId, tokenResult.tier);
      return { 
        bypass: true, // Kept for backward compatibility
        authenticated: true, 
        tokenAuth: true, 
        referrerAuth: false,
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
      log('Authentication succeeded: LEGACY_REFERRER');
      return { 
        bypass: true, // Kept for backward compatibility
        authenticated: true, 
        tokenAuth: false, 
        referrerAuth: true,
        reason: 'LEGACY_REFERRER', 
        userId: null, 
        debugInfo 
      };
    } else {
      referrerLog('No legacy token found in referrer');
    }
  
    // 4️⃣ Check allow-listed domain
    referrerLog('Checking referrer against %d allowlisted domains', debugInfo.allowlistCount);
    const allowlistMatch = allowlist.some(d => refStr.includes(d));
    if (allowlistMatch) {
      referrerLog('✅ Allowlisted domain: %s', refStr);
      debugInfo.authResult = 'ALLOWLIST';
      debugInfo.allowlistMatch = true;
      log('Authentication succeeded: ALLOWLIST');
      return { 
        bypass: true, // Enabling bypass for allowlisted domains
        authenticated: true, 
        tokenAuth: false, 
        referrerAuth: true,
        reason: 'ALLOWLIST', 
        userId: null, 
        debugInfo 
      };
    } else {
      referrerLog('Referrer does not match any allowlisted domain');
    }
    
    // 5️⃣ Check for domain registered in auth database
    referrerLog('Checking if referrer is registered in auth database');
    const dbReferrerResult = await checkReferrerInDb(ref);
    if (dbReferrerResult && dbReferrerResult.userId) {
      referrerLog('✅ Registered domain: %s for user %s (tier: %s)', ref, dbReferrerResult.userId, dbReferrerResult.tier);
      debugInfo.authResult = 'DB_REFERRER';
      debugInfo.dbReferrerMatch = true;
      debugInfo.userId = dbReferrerResult.userId;
      debugInfo.username = dbReferrerResult.username;
      debugInfo.tier = dbReferrerResult.tier;
      log('Authentication succeeded: DB_REFERRER for user %s (tier: %s)', dbReferrerResult.userId, dbReferrerResult.tier);
      return { 
        bypass: true, // Enable bypass for DB-registered referrers
        authenticated: true, 
        tokenAuth: false, 
        referrerAuth: true,
        reason: 'DB_REFERRER', 
        userId: dbReferrerResult.userId,
        tier: dbReferrerResult.tier, 
        debugInfo 
      };
    } else {
      referrerLog('Referrer is not registered in auth database');
    }
  }
  
  // 5️⃣ default → go through queue
  log('Not authenticated, request will be queued');
  // Default: not authenticated
  debugInfo.authResult = 'NONE';
  log('Authentication failed: Not authenticated');
  return { 
    bypass: false, // Kept for backward compatibility
    authenticated: false, 
    tokenAuth: false, 
    referrerAuth: false,
    reason: 'NOT_AUTHENTICATED', 
    userId: null, 
    debugInfo 
  };
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
 * @returns {Promise<Object>} Authentication result with authenticated status, reason, userId, and debugInfo
 * @throws {Error} 401 error for invalid tokens, re-throws other errors
 */
export async function handleAuthentication(req, requestId = null, logAuth = null) {
  let isAuthenticated, reason, userId, debugInfo;
  
  try {
    // Load auth context from environment
    const legacyTokens = process.env.LEGACY_TOKENS ? process.env.LEGACY_TOKENS.split(',') : [];
    const allowlist = process.env.ALLOWLISTED_DOMAINS ? process.env.ALLOWLISTED_DOMAINS.split(',') : [];
    
    // Check if request is authenticated using shared utility
    // This may throw an error if an invalid token is provided
    const authResult = await shouldBypassQueue(req, { legacyTokens, allowlist });
    isAuthenticated = authResult.authenticated;
    reason = authResult.reason;
    userId = authResult.userId;
    debugInfo = authResult.debugInfo;
    
    // Log authentication information if logger provided
    if (logAuth && requestId) {
      logAuth('Authentication result:', {
        requestId,
        isAuthenticated,
        reason,
        userId,
        debugInfo
      });
    }
    
    return {
      bypass: isAuthenticated, // Kept for backward compatibility
      authenticated: authResult.authenticated,
      tokenAuth: authResult.tokenAuth,
      referrerAuth: authResult.referrerAuth,
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
