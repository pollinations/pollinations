/**
 * Shared helper functions for Pollinations services
 * 
 * This module provides common helper functions for testing.
 */

import crypto from 'crypto';

/**
 * Generates a random string for use in tests
 * @param {number} length - Length of the string
 * @returns {string} - Random string
 */
export function randomString(length = 10) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Waits for a specified amount of time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} - Resolves after the specified time
 */
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries a function until it succeeds or times out
 * @param {Function} fn - Function to retry
 * @param {Object} options - Options
 * @param {number} options.retries - Number of retries
 * @param {number} options.interval - Interval between retries in ms
 * @param {number} options.timeout - Timeout in ms
 * @returns {Promise} - Resolves with the result of the function
 */
export async function retry(fn, { retries = 5, interval = 1000, timeout = 30000 } = {}) {
  const startTime = Date.now();
  let lastError;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      
      if (Date.now() - startTime > timeout) {
        throw new Error(`Timed out after ${timeout}ms: ${lastError.message}`);
      }
      
      await wait(interval);
    }
  }
  
  throw lastError;
}

/**
 * Generates a random seed for reproducible tests
 * @returns {number} - Random seed
 */
export function generateRandomSeed() {
  return Math.floor(Math.random() * 1000000);
}