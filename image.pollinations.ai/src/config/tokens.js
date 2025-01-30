import 'dotenv/config';
import { parse } from 'url';

/**
 * Gets the valid tokens from environment variables
 * Format in .env: VALID_TOKENS=token1,token2,token3
 * @returns {Set} Set of valid tokens
 */
function getValidTokens() {
  if (!process.env.VALID_TOKENS) return new Set();
  return new Set(process.env.VALID_TOKENS.split(',').map(token => token.trim()).filter(Boolean));
}

/**
 * Validates if a given token is authorized for queue bypass
 * @param {string} token - The token to validate
 * @returns {boolean} - Whether the token is valid
 */
export function isValidToken(token) {
  if (!token) return false;
  const validTokens = getValidTokens();
  return validTokens.has(token);
}

/**
 * Extracts token from request
 * @param {Object} req - HTTP request object
 * @returns {string|null} - The token if found, null otherwise
 */
export function extractToken(req) {
  // Check query parameters
  const { query } = parse(req.url, true);
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