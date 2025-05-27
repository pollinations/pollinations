/**
 * Utility function for getting client IP from request headers
 * Following the thin proxy design principle - keeping logic simple and minimal
 */

// Import from shared auth-utils.js instead of local implementation
export { getClientIp } from '../../../shared/auth-utils.js';
