import crypto from 'crypto';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import debug from 'debug';
import { PromiseCache } from './utils/promiseCache.js';

const MAX_CACHE_SIZE = process.env.NODE_ENV === 'test' ? 2 : 500000;
const memCache = new Map(); // Using Map to maintain insertion order for LRU
const promiseCache = new PromiseCache(MAX_CACHE_SIZE); // For caching in-flight promises

const logError = debug('pollinations:error');
const logCache = debug('pollinations:cache');

// Function to generate a cache path
const generateCachePath = (prompt, extraParams) => {
  if (!prompt) {
    prompt = "random prompt";
  }

  const sanitizedPrompt = prompt.replaceAll("/", "_").replaceAll(" ", "_")
    .replaceAll("?", "_").replaceAll("!", "_").replaceAll(":", "_")
    .replaceAll(";", "_").replaceAll("(", "_").replaceAll(")", "_")
    .replaceAll("'", "_").replaceAll('"', "_").replaceAll('"', "_")
    .replaceAll("'", "_").replaceAll("...", "_").replaceAll("-", "_")
    .replaceAll("\"", "_").replaceAll("\\", "_").replaceAll("*", "_")
    .slice(0, 50)
    .toLowerCase();

  const hash = crypto.createHash('md5').update(prompt + JSON.stringify(extraParams)).digest("hex").slice(0, 4);
  return `${sanitizedPrompt}_${hash}.jpg`;
};

// Function to check if an image is cached
export const isImageCached = (prompt, extraParams) => {
  const cachePath = generateCachePath(prompt, extraParams);
  if (memCache.has(cachePath)) {
    // Move to end of Map to mark as recently used
    const value = memCache.get(cachePath);
    memCache.delete(cachePath);
    memCache.set(cachePath, value);
    return true;
  }
  return false;
};

// Function to retrieve a cached image
export const getCachedImage = (prompt = "", extraParams) => {
  const cachePath = generateCachePath(prompt, extraParams);
  if (memCache.has(cachePath)) {
    // Move to end of Map to mark as recently used
    const value = memCache.get(cachePath);
    memCache.delete(cachePath);
    memCache.set(cachePath, value);
    return value;
  }
  return null;
};

export const cacheImage = async (prompt, extraParams, bufferPromiseCreator) => {
  const cachePath = generateCachePath(prompt, extraParams);
  
  // First check if we have a completed result in cache
  if (isImageCached(prompt, extraParams)) {
    logCache(`Found cached result for: ${cachePath}`);
    return getCachedImage(prompt, extraParams);
  }

  // Check if there's an in-flight promise for this request
  // This prevents duplicate concurrent executions
  const promiseKey = `promise_${cachePath}`;
  
  try {
    const buffer = await promiseCache.getOrCreate(promiseKey, async () => {
      logCache(`Executing image generation for: ${cachePath}`);
      const result = await bufferPromiseCreator();
      
      // Cache the completed result
      // If cache is at max size, remove oldest entry (first item in Map)
      if (memCache.size >= MAX_CACHE_SIZE) {
        const firstKey = memCache.keys().next().value;
        memCache.delete(firstKey);
        logCache(`Removed oldest cache entry: ${firstKey}`);
      }

      memCache.set(cachePath, result);
      logCache(`Cached completed image: ${cachePath}`);
      
      // Clean up the promise from the promise cache after a delay
      // This allows the result to be served from memCache for subsequent requests
      setTimeout(() => {
        promiseCache.delete(promiseKey);
        logCache(`Cleaned up promise cache for: ${promiseKey}`);
      }, 1000);
      
      return result;
    });
    
    return buffer;
  } catch (error) {
    // Promise was already removed from cache on error
    logError(`Error in cacheImage for ${cachePath}:`, error);
    throw error;
  }
};

export const memoize = (fn, getKey) => {
  const cache = {};
  return (...args) => {
    const key = getKey(...args);

    if (cache[key]) {
      return cache[key];
    }

    const result = fn(...args);

    cache[key] = result;

    return result;
  };
};
