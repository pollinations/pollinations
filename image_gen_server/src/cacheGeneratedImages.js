import fs from 'fs';
import crypto from 'crypto';

const memCache = {};

// Function to generate a cache path
const generateCachePath = (prompt, extraParams, saveFolder) => {
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
  return `${saveFolder}/${sanitizedPrompt}_${hash}.jpg`;
};

if (!fs.existsSync("/tmp/stableDiffusion_cache")) {
  fs.mkdirSync("/tmp/stableDiffusion_cache");
}

// Function to check if an image is cached
export const isImageCached = (prompt, extraParams, saveFolder = "/tmp/stableDiffusion_cache") => {
  const path = generateCachePath(prompt, extraParams, saveFolder);
  return fs.existsSync(path) || memCache[path];
};

// Function to retrieve a cached image
export const getCachedImage = async (prompt = "", extraParams, saveFolder = "/tmp/stableDiffusion_cache") => {
  const path = generateCachePath(prompt, extraParams, saveFolder);
  if (memCache[path]) {
    return await memCache[path];
  }
  if (fs.existsSync(path)) {
    return fs.readFileSync(path);
  }
  return null; // Or handle this case as per your application's logic
};
export const cacheImage = async (prompt, extraParams, bufferPromiseCreator, saveFolder = "/tmp/stableDiffusion_cache") => {
  if (isImageCached(prompt, extraParams, saveFolder)) {
    return getCachedImage(prompt, extraParams, saveFolder);
  }

  const bufferPromise = await bufferPromiseCreator();

  const path = generateCachePath(prompt, extraParams, saveFolder);
  memCache[path] = bufferPromise;
  const buffer = await bufferPromise;
  fs.writeFileSync(path, buffer);
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
