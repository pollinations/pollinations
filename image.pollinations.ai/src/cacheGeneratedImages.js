import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const memCache = {};
const diskCacheDir = '/tmp/cache';

// Ensure the disk cache directory exists
if (!fs.existsSync(diskCacheDir)) {
  fs.mkdirSync(diskCacheDir, { recursive: true });
}

// Function to generate a cache path
const generateCachePath = (prompt, extraParams) => {
  if (!prompt) {
    prompt = "random prompt";
  }

  const sanitizedPrompt = prompt.replaceAll("/", "_").replaceAll(" ", "_")
    .replaceAll("?", "_").replaceAll("!", "_").replaceAll(":", "_")
    .replaceAll(";", "_").replaceAll("(", "_").replaceAll(")", "_")
    .replaceAll("’", "_").replaceAll("“", "_").replaceAll("”", "_")
    .replaceAll("‘", "_").replaceAll("…", "_").replaceAll("—", "_")
    .replaceAll("\"", "_").replaceAll("\\", "_").replaceAll("*", "_")
    .slice(0, 50)
    .toLowerCase();

  const hash = crypto.createHash('md5').update(prompt + JSON.stringify(extraParams)).digest("hex").slice(0, 4);
  return `${sanitizedPrompt}_${hash}.jpg`;
};

// Function to check if an image is cached
export const isImageCached = (prompt, extraParams) => {
  const cachePath = generateCachePath(prompt, extraParams);
  return memCache[cachePath];
};

// Function to retrieve a cached image
export const getCachedImage = (prompt = "", extraParams) => {
  const cachePath = generateCachePath(prompt, extraParams);
  return memCache[cachePath] || null; // Or handle this case as per your application's logic
};

export const cacheImage = async (prompt, extraParams, bufferPromiseCreator) => {
  if (isImageCached(prompt, extraParams)) {
    return getCachedImage(prompt, extraParams);
  }

  const bufferPromise = bufferPromiseCreator();

  const cachePath = generateCachePath(prompt, extraParams);
  memCache[cachePath] = bufferPromise;
  try {
    const buffer = await bufferPromise;
    return buffer;
  } catch (e) {
    console.error('Error waiting for bufferPromise', e);
    memCache[cachePath] = null;
    throw e;
  }
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
