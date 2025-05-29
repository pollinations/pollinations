/**
 * Error handler utilities for API responses
 * Provides user-friendly error messages while maintaining the thin proxy design
 */

import debug from 'debug';

const logError = debug('pollinations:error');

/**
 * Creates a user-friendly error response for common API errors
 * Following the thin proxy principle, we preserve the original error information
 * while adding a layer of user-friendly context
 * 
 * @param {number} status - HTTP status code
 * @param {string} originalError - Original error message from the provider
 * @param {string} source - Source of the error (e.g., 'Azure', 'Cloudflare')
 * @returns {Object} Formatted error response ready to be sent to the client
 */
export const createFriendlyErrorResponse = (status, originalError, source = 'API') => {
  // Parse details from the original error if possible
  let details = { retryAfter: null };
  
  try {
    // Attempt to extract retry-after value from rate limit errors
    if (originalError && typeof originalError === 'string') {
      // Extract seconds from error messages like "Please retry after 11 seconds"
      const retryMatch = originalError.match(/retry after (\d+) seconds/i);
      if (retryMatch && retryMatch[1]) {
        details.retryAfter = parseInt(retryMatch[1], 10);
      }
    }
  } catch (e) {
    logError('Error parsing original error details:', e);
  }

  // Common error response structure
  const errorResponse = {
    error: getErrorTitle(status),
    message: getFriendlyMessage(status, details, source),
    errorType: getErrorType(status),
    ...(details.retryAfter ? { retryAfter: details.retryAfter } : {})
  };

  return errorResponse;
};

/**
 * Gets a user-friendly error title based on status code
 */
const getErrorTitle = (status) => {
  switch (status) {
    case 429:
      return 'Rate Limit';
    case 400:
      return 'Invalid Request';
    case 401:
    case 403:
      return 'Access Denied';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Service Unavailable';
    default:
      return 'Error';
  }
};

/**
 * Gets a user-friendly error type for programmatic handling
 */
const getErrorType = (status) => {
  switch (status) {
    case 429:
      return 'rate_limit';
    case 400:
      return 'invalid_request';
    case 401:
    case 403:
      return 'access_denied';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'service_unavailable';
    default:
      return 'unknown';
  }
};

/**
 * Gets a user-friendly error message based on status code and details
 * Follows thin proxy principle by preserving the essential meaning
 * While still providing clear guidance to users
 */
const getFriendlyMessage = (status, details, source) => {
  switch (status) {
    case 429:
      if (details.retryAfter) {
        return `Rate limit reached - wait ${details.retryAfter} seconds and try again.`;
      }
      return `Rate limit reached - try again in a few seconds.`;
    
    case 400:
      return `Invalid request parameters. Check your inputs and try again.`;
    
    case 401:
    case 403:
      return `Authorization failed. This feature requires valid credentials.`;
    
    case 500:
    case 502:
    case 503:
    case 504:
      return `${source} service unavailable. Please try again later.`;
    
    default:
      return `Request failed with status ${status}. Please try again.`;
  }
};
