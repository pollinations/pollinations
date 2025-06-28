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
import { extractReferrer, getTokenSource, extractToken } from './extractFromRequest.js';

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
 * @returns {Promise<{userId: string, username: string, tier: string}|null>} User info if valid, null otherwise.
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
        username: data.username || data.userId, // Use userId as fallback if username not provided
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
 * @param {Object} ctx - Context object (currently unused but kept for future extensibility)
 * @returns {{authenticated: boolean, tokenAuth: boolean, referrerAuth: boolean, bypass: boolean, reason: string, userId: string|null, username: string|null, tier: string, debugInfo: Object}} Authentication status, auth type, reason, userId, username if authenticated, and debug info
 * @throws {Error} If an invalid token is provided
 */
export async function shouldBypassQueue(req) {
  log('shouldBypassQueue called for request: %s %s', req.method, req.url);
  
  const token = extractToken(req);
  const ref   = extractReferrer(req);
  
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
  
  const debugInfo = {
    token: token ? (token.length > 8 ? token.substring(0, 4) + '...' + token.substring(token.length - 4) : token) : null,
    referrer: ref,
    tokenSource: token ? getTokenSource(req) : null
  };
    
  // 1️⃣ Token-based authentication
  if (token) {
    tokenLog('Validating token: %s', debugInfo.token);
    tokenLog('Checking token against auth.pollinations.ai API');
    const tokenResult = await validateApiTokenDb(token);
    if (tokenResult && tokenResult.userId) {
      tokenLog('✅ Valid DB token found for user: %s (tier: %s)', tokenResult.userId, tokenResult.tier);
      debugInfo.authResult = 'DB_TOKEN';
      debugInfo.userId = tokenResult.userId;
      debugInfo.username = tokenResult.username;
      debugInfo.tier = tokenResult.tier;
      log('Authentication succeeded: DB_TOKEN for user %s (tier: %s)', tokenResult.userId, tokenResult.tier);
      return {
        bypass: true,
        authenticated: true,
        tokenAuth: true,
        referrerAuth: false,
        reason: 'DB_TOKEN',
        ...tokenResult,
        debugInfo
      };
    }
    // If token is provided but it's not valid, we log it and continue.
    tokenLog('❌ Invalid or unrecognized token provided: %s. Will try other auth methods.', debugInfo.token);
    errorLog('Invalid or unrecognized token provided (source: %s, token: %s)', debugInfo.tokenSource || 'unknown', debugInfo.token);
  }
  
  // 2️⃣ Referrer-based authentication
  if (ref) {
    const refStr = String(ref); 

    referrerLog('Checking if referrer is registered in auth database: %s', refStr);
    const dbReferrerResult = await checkReferrerInDb(refStr);
    if (dbReferrerResult && dbReferrerResult.userId) {
      referrerLog('✅ Registered domain: %s for user %s (tier: %s)', refStr, dbReferrerResult.userId, dbReferrerResult.tier);
      debugInfo.authResult = 'DB_REFERRER';
      debugInfo.dbReferrerMatch = true; // Ensuring this is included
      debugInfo.userId = dbReferrerResult.userId;
      debugInfo.username = dbReferrerResult.username; // Ensuring this is included
      debugInfo.tier = dbReferrerResult.tier;
      log('Authentication succeeded: DB_REFERRER for user %s (tier: %s)', dbReferrerResult.userId, dbReferrerResult.tier);
      return { 
        bypass: true, 
        authenticated: true, 
        tokenAuth: false,
        referrerAuth: true,
        reason: 'DB_REFERRER', 
        ...dbReferrerResult,
        debugInfo 
      };
    } else {
      referrerLog('Referrer is not a registered domain in auth database: %s', refStr);
    }
  }

  // Default return if no authentication method succeeds
  log('Authentication failed: NO_AUTH_METHOD_SUCCESS (No valid token or registered referrer found)');
  debugInfo.authResult = 'NONE';
  return {
    bypass: false,
    authenticated: false,
    tokenAuth: false,
    referrerAuth: false,
    reason: 'NO_AUTH_METHOD_SUCCESS',
    userId: null,
    username: null,
    tier: 'anonymous',  // Default to anonymous tier for unauthenticated users
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
    // Check if request is authenticated using shared utility
    // This may throw an error if an invalid token is provided
    // const allowlist = process.env.ALLOWLISTED_DOMAINS ? process.env.ALLOWLISTED_DOMAINS.split(',') : []; // Removed allowlist
    const authResult = await shouldBypassQueue(req);
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
      ...authResult,
      // Use the tier from authResult, which comes from shouldBypassQueue
      // This preserves the 'anonymous' tier for unauthenticated users
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
  if (debugInfo.token || debugInfo.tokenSource) {
    debug.tokenInfo = {
      present: !!debugInfo.token,
      source: debugInfo.tokenSource || 'none'
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

/**
 * Fetch user preferences from auth.pollinations.ai
 * @param {string} userId - The user ID to fetch preferences for
 * @returns {Promise<Object|null>} User preferences object or null if not found/error
 */
export async function getUserPreferences(userId) {
  if (!userId) return null;
  
  const preferenceLog = debug('pollinations:auth:preferences');
  
  try {
    preferenceLog(`Fetching preferences for user ${userId}`);
    
    // Using admin endpoint to access preferences
    const response = await fetch(
      `https://auth.pollinations.ai/admin/preferences?user_id=${encodeURIComponent(userId)}`,
      {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${process.env.ADMIN_API_KEY}`
        }
      }
    );
    
    if (!response.ok) {
      preferenceLog(`Failed to fetch preferences: ${response.status} ${response.statusText}`);
      // Log response body for debugging if status is not 404 (not found)
      if (response.status !== 404) {
        try {
          const errorBody = await response.text();
          preferenceLog('Error response body:', errorBody);
        } catch (e) {
          // Ignore error reading body
        }
      }
      return null;
    }
    
    const data = await response.json();
    preferenceLog('Preferences fetched successfully:', data.preferences);
    
    return data.preferences || {};
  } catch (error) {
    preferenceLog('Error fetching preferences:', error);
    return null;
  }
}

// Set up debug logger for tier access
const tierLog = debug('pollinations:auth:tier');

/**
 * Tier hierarchy definition - higher numbers have access to lower tier models
 * anonymous: 1 - Basic tier, can access anonymous models
 * seed: 2 - Mid tier, can access anonymous and seed models
 * flower: 3 - Premium tier, can access all models including uncensored
 * nectar: 4 - Highest tier, can access all models with highest priority
 */
const TIER_HIERARCHY = {
  'anonymous': 1,
  'seed': 2,
  'flower': 3,
  'nectar': 4
};

/**
 * Check if a user's tier allows access to a model's required tier
 * @param {string} userTier - The user's tier ('anonymous', 'seed', 'flower')
 * @param {string} modelTier - The model's required tier ('anonymous', 'seed', 'flower')
 * @returns {boolean} Whether the user has sufficient tier access
 */
export function hasModelTierAccess(userTier, modelTier) {
  if (!userTier) userTier = 'anonymous'; // Default to anonymous for unauthenticated users
  if (!modelTier) modelTier = 'anonymous'; // Default to anonymous for models without tier
  
  const userTierLevel = TIER_HIERARCHY[userTier] || TIER_HIERARCHY['anonymous'];
  const modelTierLevel = TIER_HIERARCHY[modelTier] || TIER_HIERARCHY['anonymous'];
  
  const hasAccess = userTierLevel >= modelTierLevel;
  
  tierLog(`Tier access check: user=${userTier}(${userTierLevel}) model=${modelTier}(${modelTierLevel}) access=${hasAccess}`);
  
  return hasAccess;
}

/**
 * Check if a user has access to a model based on tier requirements
 * This function checks tier access and throws a properly formatted error if access is denied
 * 
 * @param {string} modelName - The name of the model being accessed
 * @param {string} modelTier - The tier required for the model ('anonymous', 'seed', 'flower')
 * @param {string} userTier - The user's current tier ('anonymous', 'seed', 'flower')
 * @throws {Error} Throws a 403 error with INSUFFICIENT_TIER code if access is denied
 */
export function checkModelTierAccess(modelName, modelTier, userTier) {
  tierLog(`Checking tier access for model ${modelName}: user tier=${userTier}, required tier=${modelTier}`);
  
  if (!hasModelTierAccess(userTier, modelTier)) {
    tierLog(`TIER ACCESS DENIED: ${userTier} cannot access ${modelTier} model ${modelName}`);
    
    const error = new Error(
      `Access to ${modelName} model requires ${modelTier} tier or higher. ` +
      `Your current tier is ${userTier}. Please visit https://auth.pollinations.ai to authenticate ` +
      `and upgrade your tier.`
    );
    error.status = 403;
    error.code = 'INSUFFICIENT_TIER';
    error.model = modelName;
    error.requiredTier = modelTier;
    error.userTier = userTier;
    throw error;
  }
  
  tierLog(`TIER ACCESS GRANTED: ${userTier} can access ${modelTier} model ${modelName}`);
  return true;
}

/**
 * Check if a user can access a specific model based on tier requirements
 * @param {Object} model - The model object from availableModels
 * @param {string} userTier - The user's tier
 * @returns {boolean} Whether the user can access this model
 */
export function canAccessModel(model, userTier) {
  if (!model) return false;
  
  return hasModelTierAccess(userTier, model.tier);
}

/**
 * Find the best available fallback model for a user's tier when they can't access the requested model
 * @param {Array} availableModels - Array of all available models
 * @param {string} userTier - The user's current tier
 * @param {string} preferredProvider - Optional preferred provider for fallback
 * @returns {Object|null} The fallback model object or null if none available
 */
export function findFallbackModel(availableModels, userTier, preferredProvider = null) {
  if (!availableModels || !Array.isArray(availableModels)) return null;
  
  // Filter models the user can access
  const accessibleModels = availableModels.filter(model => canAccessModel(model, userTier));
  
  if (accessibleModels.length === 0) return null;
  
  // If a preferred provider is specified, try to find a model from that provider first
  if (preferredProvider) {
    const preferredProviderModel = accessibleModels.find(model => model.provider === preferredProvider);
    if (preferredProviderModel) {
      tierLog(`Found fallback model from preferred provider ${preferredProvider}: ${preferredProviderModel.name}`);
      return preferredProviderModel;
    }
  }
  
  // Default fallback priority: openai > openai-fast > others
  const fallbackPriority = ['openai', 'openai-fast'];
  
  for (const modelName of fallbackPriority) {
    const fallbackModel = accessibleModels.find(model => model.name === modelName);
    if (fallbackModel) {
      tierLog(`Found priority fallback model: ${fallbackModel.name}`);
      return fallbackModel;
    }
  }
  
  // If no priority models available, return the first accessible model
  const fallbackModel = accessibleModels[0];
  tierLog(`Using first available fallback model: ${fallbackModel.name}`);
  return fallbackModel;
}

/**
 * Validate model access for a user and return the appropriate model or fallback
 * @param {string} requestedModelName - The name of the requested model
 * @param {Array} availableModels - Array of all available models  
 * @param {string} userTier - The user's tier
 * @param {boolean} allowFallback - Whether to return a fallback model if access is denied
 * @returns {Object} Result object with { allowed: boolean, model: Object|null, reason: string, fallback: boolean }
 */
export function validateModelAccess(requestedModelName, availableModels, userTier, allowFallback = true) {
  if (!requestedModelName || !availableModels) {
    return {
      allowed: false,
      model: null,
      reason: 'Invalid parameters',
      fallback: false
    };
  }
  
  // Find the requested model
  const requestedModel = availableModels.find(model => 
    model.name === requestedModelName || model.aliases === requestedModelName
  );
  
  if (!requestedModel) {
    // If model doesn't exist, try to find a fallback
    if (allowFallback) {
      const fallbackModel = findFallbackModel(availableModels, userTier);
      if (fallbackModel) {
        tierLog(`Model '${requestedModelName}' not found, using fallback: ${fallbackModel.name}`);
        return {
          allowed: true,
          model: fallbackModel,
          reason: `Model '${requestedModelName}' not found, using fallback`,
          fallback: true
        };
      }
    }
    
    return {
      allowed: false,
      model: null,
      reason: `Model '${requestedModelName}' not found`,
      fallback: false
    };
  }
  
  // Check if user has access to the requested model
  if (canAccessModel(requestedModel, userTier)) {
    return {
      allowed: true,
      model: requestedModel,
      reason: 'Access granted',
      fallback: false
    };
  }
  
  // Access denied - try to find a fallback if allowed
  if (allowFallback) {
    const fallbackModel = findFallbackModel(availableModels, userTier, requestedModel.provider);
    if (fallbackModel) {
      tierLog(`User tier '${userTier}' insufficient for model '${requestedModelName}' (requires '${requestedModel.tier}'), using fallback: ${fallbackModel.name}`);
      return {
        allowed: true,
        model: fallbackModel,
        reason: `Insufficient tier for '${requestedModelName}' (requires '${requestedModel.tier}'), using fallback`,
        fallback: true
      };
    }
  }
  
  // No fallback available or fallback not allowed
  return {
    allowed: false,
    model: null,
    reason: `Insufficient tier: '${requestedModelName}' requires '${requestedModel.tier}' tier, you have '${userTier}' tier`,
    fallback: false
  };
}
