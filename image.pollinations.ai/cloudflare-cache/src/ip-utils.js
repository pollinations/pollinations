/**
 * IP utility functions for Cloudflare Workers
 */

/**
 * Get the client IP address from the request
 * @param {Request} req - The request object
 * @returns {string} The client IP address or 'unknown'
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
