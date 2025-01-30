import 'dotenv/config';

/**
 * Gets the valid tokens from environment variables
 * Format in .env: VALID_TOKENS=token1:name1:desc1,token2:name2:desc2
 * @returns {Object} Map of valid tokens to their metadata
 */
function getValidTokens() {
  const tokens = {};
  
  if (process.env.VALID_TOKENS) {
    process.env.VALID_TOKENS.split(',').forEach(tokenEntry => {
      const [token, name, description] = tokenEntry.split(':');
      if (token) {
        tokens[token] = { name, description };
      }
    });
  }
  
  return tokens;
}

/**
 * Validates if a given token is authorized for queue bypass
 * @param {string} token - The token to validate
 * @returns {boolean} - Whether the token is valid
 */
export function isValidToken(token) {
  const validTokens = getValidTokens();
  return token && validTokens.hasOwnProperty(token);
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