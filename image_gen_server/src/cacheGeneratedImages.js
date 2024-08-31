import crypto from 'crypto';

const memCache = {};

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
    .slice(0, 50)
    .toLowerCase();

  const hash = crypto.createHash('md5').update(prompt + JSON.stringify(extraParams)).digest("hex").slice(0, 4);
  return `${sanitizedPrompt}_${hash}.jpg`;
};

// Function to check if an image is cached
export const isImageCached = (prompt, extraParams) => {
  const path = generateCachePath(prompt, extraParams);
  return memCache[path];
};

// Function to retrieve a cached image
export const getCachedImage = async (prompt = "", extraParams) => {
  const path = generateCachePath(prompt, extraParams);
  if (memCache[path]) {
    return await memCache[path];
  }
  return null; // Or handle this case as per your application's logic
};

export const cacheImage = async (prompt, extraParams, bufferPromiseCreator) => {
  if (isImageCached(prompt, extraParams)) {
    return getCachedImage(prompt, extraParams);
  }

  const bufferPromise = bufferPromiseCreator();

  const path = generateCachePath(prompt, extraParams);
  memCache[path] = bufferPromise;

  const buffer = await bufferPromise;

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
