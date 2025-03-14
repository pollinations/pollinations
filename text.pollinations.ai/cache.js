import crypto from 'crypto';
import debug from 'debug';

const log = debug('pollinations:cache');
const errorLog = debug('pollinations:error');

// Cache storage
const cache = {};

// Helper function to get response from cache
function getFromCache(cacheKey) {
    try {
        const cachedItem = cache[cacheKey] || null;
        
        if (cachedItem) {
            log('Cache hit for key: %s', cacheKey);
            
            // For streaming responses, add metadata to help with replay
            if (cachedItem.stream === true) {
                log('Found cached streaming response');
                return {
                    ...cachedItem,
                    cachedStream: true,
                    responseStream: null, // Remove any non-serializable stream
                    cacheTimestamp: Date.now()
                };
            }
        }
        
        return cachedItem;
    } catch (error) {
        errorLog('Error getting from cache: %s', error.message);
        return null;
    }
}

// Helper function to set response in cache
function setInCache(cacheKey, completion) {
    try {
        if (!completion) {
            log('Attempted to cache null/undefined completion');
            return;
        }
        
        log('Setting cache for key: %s', cacheKey);
        
        // For streaming responses, store a sanitized version
        if (completion.stream === true) {
            log('Storing streaming response in cache');
            // Create a deep clone to avoid modifying the original
            const cachedVersion = JSON.parse(JSON.stringify({
                ...completion,
                // Make sure key properties are preserved
                stream: true,
                id: completion.id || `cached_${Date.now()}`,
                model: completion.model || 'unknown',
                // Add metadata for replay
                cachedStream: true,
                cacheTimestamp: Date.now()
            }));
            
            // Remove any stream objects which can't be cached
            delete cachedVersion.responseStream;
            
            cache[cacheKey] = cachedVersion;
            log('Stored streaming response in cache (sanitized)');
        } else {
            // For non-streaming responses, cache as-is
            cache[cacheKey] = completion;
            log('Stored regular response in cache');
        }
    } catch (error) {
        errorLog('Error setting cache: %s', error.message);
        errorLog('Error stack: %s', error.stack);
    }
}

// Helper function to create a hash for the cache key
function createHashKey(data) {
    try {
        // Create a sanitized copy for consistent hashing
        const sanitizedData = { ...data };
        
        // Remove non-serializable or changing properties
        delete sanitizedData.responseStream;
        
        // For consistent hash generation
        return crypto.createHash('sha256').update(JSON.stringify(sanitizedData)).digest('hex');
    } catch (error) {
        errorLog('Error creating hash key: %s', error.message);
        // Create a fallback key
        return `fallback-${Date.now()}`;
    }
}

export { getFromCache, setInCache, createHashKey };
