import crypto from "node:crypto";
import debug from "debug";

const MAX_CACHE_SIZE = process.env.NODE_ENV === "test" ? 2 : 1000;
const memCache = new Map(); // Using Map to maintain insertion order for LRU

const logError = debug("pollinations:error");
const logCache = debug("pollinations:cache");

// Evict oldest entries when cache is full
const evictOldest = () => {
    if (memCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = memCache.keys().next().value;
        memCache.delete(oldestKey);
        logCache(`Evicted oldest entry: ${oldestKey}`);
    }
};

// Function to generate a cache path
const generateCachePath = (prompt: string, extraParams: object): string => {
    if (!prompt) {
        prompt = "random prompt";
    }

    const sanitizedPrompt = prompt
        .replaceAll("/", "_")
        .replaceAll(" ", "_")
        .replaceAll("?", "_")
        .replaceAll("!", "_")
        .replaceAll(":", "_")
        .replaceAll(";", "_")
        .replaceAll("(", "_")
        .replaceAll(")", "_")
        .replaceAll("'", "_")
        .replaceAll('"', "_")
        .replaceAll('"', "_")
        .replaceAll("'", "_")
        .replaceAll("...", "_")
        .replaceAll("-", "_")
        .replaceAll('"', "_")
        .replaceAll("\\", "_")
        .replaceAll("*", "_")
        .slice(0, 50)
        .toLowerCase();

    const hash = crypto
        .createHash("md5")
        .update(prompt + JSON.stringify(extraParams))
        .digest("hex")
        .slice(0, 4);

    // Use .mp4 extension for video models, .jpg for images
    const model = (extraParams as { model?: string })?.model;
    const isVideo = model === "veo" || model === "seedance";
    const ext = isVideo ? ".mp4" : ".jpg";
    return `${sanitizedPrompt}_${hash}${ext}`;
};

// Function to check if an image is cached
export const isImageCached = (prompt: string, extraParams: object): boolean => {
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
export const getCachedImage = (prompt: string = "", extraParams: object) => {
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

// New function that caches promises immediately to prevent duplicate generation
export const cacheImagePromise = async (
    prompt: string,
    extraParams: object,
    bufferPromiseCreator: { (): Promise<any>; (): any },
) => {
    const cachePath = generateCachePath(prompt, extraParams);

    // Check if we already have a cached result or promise
    if (memCache.has(cachePath)) {
        const cached = memCache.get(cachePath);
        memCache.delete(cachePath);
        memCache.set(cachePath, cached); // Move to end for LRU

        // If it's a promise, wait for it; otherwise return the buffer
        if (cached instanceof Promise) {
            logCache(`Found in-flight promise for: ${cachePath}`);
            return await cached;
        } else {
            logCache(`Found cached result for: ${cachePath}`);
            return cached;
        }
    }

    // Create the promise and cache it immediately
    logCache(`Starting new generation for: ${cachePath}`);
    const promise = bufferPromiseCreator();

    // Cache the promise immediately
    memCache.set(cachePath, promise);
    evictOldest(); // Evict when adding new entry

    try {
        // Wait for the promise to resolve
        const buffer = await promise;

        // Replace the promise with the actual result
        memCache.set(cachePath, buffer);
        evictOldest(); // Evict when storing result
        logCache(`Completed generation and cached result for: ${cachePath}`);

        return buffer;
    } catch (error) {
        // Remove failed promise from cache
        memCache.delete(cachePath);
        logError(`Generation failed for ${cachePath}:`, error);
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
