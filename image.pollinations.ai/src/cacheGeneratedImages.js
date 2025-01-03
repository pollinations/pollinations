import crypto from 'crypto';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import debug from 'debug';

const MAX_CACHE_SIZE = 500000;
const memCache = new Map(); // Using Map to maintain insertion order for LRU

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
  if (isImageCached(prompt, extraParams)) {
    return getCachedImage(prompt, extraParams);
  }

  const cachePath = generateCachePath(prompt, extraParams);
  const buffer = await bufferPromiseCreator();

  // If cache is at max size, remove oldest entry (first item in Map)
  if (memCache.size >= MAX_CACHE_SIZE) {
    const firstKey = memCache.keys().next().value;
    memCache.delete(firstKey);
    logCache(`Removed oldest cache entry: ${firstKey}`);
  }

  memCache.set(cachePath, buffer);
  logCache(`Cached image: ${cachePath}`);
  return buffer;
};

const memoize = (fn, getKey) => {
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
