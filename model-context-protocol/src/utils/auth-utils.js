/**
 * Authentication utilities for Pollinations API
 * 
 * This module provides helper functions for authenticated API requests
 * to the Pollinations authentication service.
 */

// Use node-fetch for Node.js environments
let fetch;
try {
  fetch = globalThis.fetch || require('node-fetch');
} catch (e) {
  // If node-fetch is not available, we'll use the global fetch
  fetch = globalThis.fetch;
}

/**
 * Make an authenticated fetch request
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithAuth(url, options = {}) {
  try {
    // Ensure headers exist
    options.headers = options.headers || {};
    
    // Make the request
    const response = await fetch(url, options);
    
    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 5;
      console.warn(`Rate limited. Retrying after ${retryAfter} seconds.`);
      
      // Wait for the specified time
      await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
      
      // Retry the request
      return fetchWithAuth(url, options);
    }
    
    return response;
  } catch (error) {
    console.error('Error in fetchWithAuth:', error);
    throw error;
  }
}

/**
 * Validate a JWT token
 * @param {string} token - JWT token to validate
 * @returns {Promise<Object>} - Token validation result
 */
async function validateToken(token) {
  try {
    const response = await fetch(`https://auth.pollinations.ai/api/validate-token/${token}`);
    
    if (!response.ok) {
      return { valid: false };
    }
    
    const data = await response.json();
    return { valid: true, ...data };
  } catch (error) {
    console.error('Error validating token:', error);
    return { valid: false, error: error.message };
  }
}

// Export the utilities
module.exports = {
  fetchWithAuth,
  validateToken
};