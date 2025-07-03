/**
 * Shared assertions for Pollinations services
 * 
 * This module provides common assertions for API responses.
 */

/**
 * Asserts that a response is a successful JSON response
 * @param {Object} response - Supertest response object
 * @param {Function} expect - Vitest expect function
 * @param {number} status - Expected status code (default: 200)
 */
export function assertSuccessfulJsonResponse(response, expect, status = 200) {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(response.body).toBeDefined();
}

/**
 * Asserts that a response is a successful image response
 * @param {Object} response - Supertest response object
 * @param {Function} expect - Vitest expect function
 * @param {number} status - Expected status code (default: 200)
 */
export function assertSuccessfulImageResponse(response, expect, status = 200) {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toMatch(/image\//);
  expect(response.body).toBeDefined();
}

/**
 * Asserts that a response contains an error
 * @param {Object} response - Supertest response object
 * @param {Function} expect - Vitest expect function
 * @param {number} status - Expected status code
 * @param {string} errorMessage - Expected error message (optional)
 */
export function assertErrorResponse(response, expect, status, errorMessage) {
  expect(response.status).toBe(status);
  
  if (response.headers['content-type']?.includes('application/json')) {
    expect(response.body).toBeDefined();
    expect(response.body.error).toBeDefined();
    
    if (errorMessage) {
      expect(response.body.error).toMatch(errorMessage);
    }
  }
}