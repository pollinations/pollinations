// Configuration for API tokens that can bypass the queue
// Format: { token: { name: string, description: string } }

export const VALID_TOKENS = {
  // Token for @metimol's startup
  'metimol-startup-token': {
    name: '@metimol startup',
    description: 'Queue bypass token for startup integration'
  }
};

/**
 * Validates if a given token is authorized for queue bypass
 * @param {string} token - The token to validate
 * @returns {boolean} - Whether the token is valid
 */
export function isValidToken(token) {
  return token && VALID_TOKENS.hasOwnProperty(token);
}

/**
 * Extracts token from request
 * @param {Object} req - HTTP request object
 * @returns {string|null} - The token if found, null otherwise
 */
export function extractToken(req) {
  // Check query parameters
  const { query } = require('url').parse(req.url, true);
  if (query.token) {
    return query.token;
  }

  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check custom header
  return req.headers['x-pollinations-token'] || null;
}