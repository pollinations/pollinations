/**
 * Utility function for getting client IP from request headers
 * Following the thin proxy design principle - keeping logic simple and minimal
 */

/**
 * Get client IP address from request headers
 * @param {Request} request - The request object
 * @returns {string} - The client IP address or 'unknown'
 */
export function getClientIp(request) {
  return request?.headers?.get('cf-connecting-ip') || 
         request?.headers?.get('x-forwarded-for')?.split(',')[0] || 
         'unknown';
}
