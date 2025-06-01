/**
 * A promise-aware cache that prevents duplicate concurrent executions
 * for the same key by caching the promise itself, not just the result.
 */

import debug from 'debug';

const logCache = debug('pollinations:promise-cache');

export class PromiseCache {
  constructor(maxSize = 500000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get or create a cached promise
   * @param {string} key - Cache key
   * @param {Function} promiseCreator - Function that returns a promise
   * @returns {Promise} The cached or newly created promise
   */
  async getOrCreate(key, promiseCreator) {
    // Check if we have a cached promise
    if (this.cache.has(key)) {
      logCache(`Found cached promise for key: ${key}`);
      const cachedEntry = this.cache.get(key);
      
      // Move to end to mark as recently used (LRU)
      this.cache.delete(key);
      this.cache.set(key, cachedEntry);
      
      // Return the existing promise
      return cachedEntry.promise;
    }

    // Create new promise
    logCache(`Creating new promise for key: ${key}`);
    const promise = promiseCreator();
    
    // Store the promise itself
    this.cache.set(key, { promise, timestamp: Date.now() });
    
    // Clean up on error to allow retry
    promise.catch(() => {
      logCache(`Promise failed for key: ${key}, removing from cache`);
      this.cache.delete(key);
    });

    // Enforce size limit
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      logCache(`Removed oldest cache entry: ${firstKey}`);
    }

    return promise;
  }

  /**
   * Clear the entire cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Check if key exists in cache
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Delete a specific key from cache
   */
  delete(key) {
    return this.cache.delete(key);
  }
}
