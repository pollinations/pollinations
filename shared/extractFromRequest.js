/**
 * Extract referrer from request headers and body
 * Used for frontend app identification, extended access, and analytics
 * @param {Request|Object} req - The request object (can be Cloudflare Request or Express req)
 * @returns {string|null} The referrer URL or null
 */

// Token field configuration for DRY principle
export const TOKEN_FIELDS = {
  query: ['token'],
  header: ['authorization', 'x-pollinations-token'],
  body: ['token' ]
};

export function extractReferrer(req) {
  // First check URL query parameters (highest priority)
  const url = req.url;
  if (url) {
    const urlObj = new URL(url, 'http://x'); // Use dummy base for relative URLs
    const queryReferrer = urlObj.searchParams.get('referrer') ||
      urlObj.searchParams.get('referer'); // Support both spellings
    if (queryReferrer) return queryReferrer;
  }

  // Then check body for referrer field (second priority) - not just for POST
  if (req.body?.referrer) return String(req.body.referrer);
  if (req.body?.referer) return String(req.body.referer);

  // Finally check headers (lowest priority)
  // Handle Cloudflare Workers Request
  if (req.headers && typeof req.headers.get === 'function') {
    const headerReferrer = req.headers.get('referer') ||
      req.headers.get('referrer') || // Support both spellings
      req.headers.get('origin');
    if (headerReferrer) return headerReferrer;
  } else if (req.headers && typeof req.headers === 'object') {
    // Handle Express/Node.js request
    const headerReferrer = req.headers.referer ||
      req.headers.referrer || // Support both spellings
      req.headers.origin;
    if (headerReferrer) return headerReferrer;
  }

  return null;
}/**
 * Get IP address from request (with privacy masking)
 * @param {Object} req - The request object
 * @returns {string} The IP address (truncated for privacy)
 */

export function getIp(req) {
  // Prioritize standard proxy headers and add cloudflare-specific headers
  const ip = req.headers["x-bb-ip"] ||
    req.headers["x-nf-client-connection-ip"] ||
    req.headers["x-real-ip"] ||
    req.headers['x-forwarded-for'] ||
    req.headers['cf-connecting-ip'] ||
    (req.socket ? req.socket.remoteAddress : null);

  if (!ip) return null;

  // Handle x-forwarded-for which can contain multiple IPs (client, proxy1, proxy2, ...)
  // The client IP is typically the first one in the list
  const cleanIp = ip.split(',')[0].trim();

  // Check if IPv4 or IPv6
  if (cleanIp.includes(':')) {
    // IPv6 address - take first 4 segments (64 bits) which typically represent the network prefix
    // Handle special IPv6 formats like ::1 or 2001::
    const segments = cleanIp.split(':');
    let normalizedSegments = [];

    // Handle :: notation (compressed zeros)
    if (cleanIp.includes('::')) {
      const parts = cleanIp.split('::');
      const leftPart = parts[0] ? parts[0].split(':') : [];
      const rightPart = parts[1] ? parts[1].split(':') : [];

      // Calculate how many zero segments are represented by ::
      const missingSegments = 8 - leftPart.length - rightPart.length;

      normalizedSegments = [
        ...leftPart,
        ...Array(missingSegments).fill('0'),
        ...rightPart
      ];
    } else {
      normalizedSegments = segments;
    }

    return normalizedSegments.slice(0, 4).join(':');
  } else {
    // IPv4 address - take first 3 segments
    return cleanIp.split('.').slice(0, 3).join('.');
  }
}
/**
 * Extract authentication token from request
 * Supports multiple token sources (NO referrer fallback)
 * Compatible with OpenAI and other LLM API authentication patterns
 * @param {Request|Object} req - The request object
 * @returns {string|null} The token or null
 */
export function extractToken(req) {
  // Check URL query parameters
  const queryResult = extractFromQuery(req.url, TOKEN_FIELDS.query);
  if (queryResult.value) return queryResult.value;
  
  // Check headers for Bearer token, API key, and custom headers
  const headerResult = extractFromHeaders(req.headers, TOKEN_FIELDS.header);
  if (headerResult.value) return headerResult.value;
  
  // Check body for token field in POST requests (multiple field names)
  if (req.method === 'POST' && req.body) {
    const bodyResult = extractFromBody(req.body, TOKEN_FIELDS.body);
    if (bodyResult.value) return bodyResult.value;
  }
  
  return null;  // header/query/body only – no referrer here!
}

/**
 * Determine the source of the token (header, query param, body)
 * @param {Request|Object} req - The request object
 * @returns {string} The source of the token
 */

export function getTokenSource(req) {
  const token = extractToken(req);
  if (!token) return 'unknown';

  const queryResult = extractFromQuery(req.url, TOKEN_FIELDS.query);
  if (queryResult.value === token) return queryResult.source;

  const headerResult = extractFromHeaders(req.headers, TOKEN_FIELDS.header);
  if (headerResult.value === token) return headerResult.source;

  const bodyResult = extractFromBody(req.body, TOKEN_FIELDS.body);
  if (bodyResult.value === token) return bodyResult.source;

  return 'unknown';
}
/**
 * Get client IP address from request
 * @param {Request|Object} req - The request object
 * @returns {string} The client IP or 'unknown'
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
/**
 * Helper function to extract value from query parameters
 * @param {string} url - Request URL
 * @param {string[]} fields - Array of field names to check
 * @returns {Object} { value, source } or { value: null, source: null }
 */
export function extractFromQuery(url, fields) {
  const urlObj = new URL(url, 'http://x');
  for (const field of fields) {
    const value = urlObj.searchParams.get(field);
    if (value) return { value, source: `query:${field}` };
  }
  return { value: null, source: null };
}
/**
 * Helper function to extract value from headers (supports both Cloudflare and Express styles)
 * @param {Object} headers - Request headers
 * @param {string[]} fields - Array of field names to check
 * @returns {Object} { value, source } or { value: null, source: null }
 */
export function extractFromHeaders(headers, fields) {
  for (const field of fields) {
    let value = null;

    if (headers.get) { // Cloudflare-style headers
      value = headers.get(field);
    } else if (headers) { // Express-style headers
      value = headers[field] || headers[field.toLowerCase()];
    }

    if (value) {
      // Special handling for authorization header
      if (field === 'authorization') {
        value = value.replace(/^Bearer\s+/i, '');
      }
      return { value, source: `header:${field}` };
    }
  }
  return { value: null, source: null };
}

/**
 * Helper function to extract value from request body
 * @param {Object} body - Request body
 * @param {string[]} fields - Array of field names to check
 * @returns {Object} { value, source } or { value: null, source: null }
 */
export function extractFromBody(body, fields) {
  if (!body) return { value: null, source: null };
  
  for (const field of fields) {
    const value = body[field];
    if (value) return { value, source: `body:${field}` };
  }
  return { value: null, source: null };
}

