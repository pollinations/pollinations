/**
 * Utility function for getting client IP from request headers
 * Following the thin proxy design principle - keeping logic simple and minimal
 */

/**
 * Get client IP address from request
 * @param {Request|Object} req - The request object
 * @returns {string} The client IP or 'unknown'
 */
export function getClientIp(req) {
  // Try Cloudflare-specific headers first
  if (req.headers.get) { // Cloudflare Request object
    return req.headers.get('cf-connecting-ip') || 
           req.headers.get('x-real-ip') || 
           req.headers.get('x-forwarded-for')?.split(',')[0] || 
           'unknown';
  }
  
  // Fallback for Express-style request objects
  if (req.headers) {
    return req.headers['cf-connecting-ip'] || 
           req.headers['x-real-ip'] || 
           req.headers['x-forwarded-for']?.split(',')[0] || 
           req.ip || 
           'unknown';
  }
  
  return 'unknown';
}
