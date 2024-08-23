import fs from 'fs';
import crypto from 'crypto';

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
  const exists = fs.existsSync(path);
  console.log(`Checking disk cache for ${path}: ${exists ? 'Found' : 'Not found'}`);
  return exists;
};


// Function to retrieve a cached image
export const getCachedImage = (prompt = "", extraParams, saveFolder = "/tmp/stableDiffusion_cache") => {
  const path = generateCachePath(prompt, extraParams, saveFolder);
  if (fs.existsSync(path)) {
    console.log(`Retrieved image from disk cache: ${path}`);
    return fs.readFileSync(path);
  }
  console.log(`Failed to retrieve image from disk cache: ${path}`);
  return null;
};

export const cacheImage = (prompt, extraParams, buffer, saveFolder = "/tmp/stableDiffusion_cache") => {
  const path = generateCachePath(prompt, extraParams, saveFolder);
  fs.writeFileSync(path, buffer);
  console.log(`Cached image to disk: ${path}`);
}

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
