import crypto from 'crypto';
import debug from 'debug';

const log = debug('pollinations:cache');

// Cache storage
const cache = {};

// Helper function to get response from cache
function getFromCache(cacheKey) {
    return cache[cacheKey] || null;
}

// Helper function to set response in cache
function setInCache(cacheKey, value) {
    cache[cacheKey] = value;
}

// Helper function to create a hash for the cache key
function createHashKey(data) {
    // Ensure the data used for the cache key is deterministic
    const deterministicData = JSON.parse(JSON.stringify(data));
    return crypto.createHash('sha256').update(JSON.stringify(deterministicData)).digest('hex');
}

export { getFromCache, setInCache, createHashKey };
