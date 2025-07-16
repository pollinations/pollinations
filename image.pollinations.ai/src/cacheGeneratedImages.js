import crypto from "crypto";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import debug from "debug";

const MAX_CACHE_SIZE = process.env.NODE_ENV === "test" ? 2 : 500000;
const memCache = new Map(); // Using Map to maintain insertion order for LRU

const logError = debug("pollinations:error");
const logCache = debug("pollinations:cache");

// Function to generate a cache path
const generateCachePath = (prompt, extraParams) => {
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

// New function that caches promises immediately to prevent duplicate generation
export const cacheImagePromise = async (
    prompt,
    extraParams,
    bufferPromiseCreator,
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

    try {
        // Wait for the promise to resolve
        const buffer = await promise;

        // Replace the promise with the actual result
        memCache.set(cachePath, buffer);
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
