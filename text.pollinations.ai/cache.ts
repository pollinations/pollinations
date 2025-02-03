import crypto from 'crypto'

// Cache storage
const cache: Record<string, any> = {}

// Helper function cache response helpers
function getFromCache(cacheKey: string) { return cache[cacheKey] ?? null }
function setInCache(cacheKey: string, value: any) { cache[cacheKey] = value }

// Helper function to create a hash for the cache key
// Ensure the data used for the cache key is deterministic
function createHashKey(data: any) { return crypto.createHash('sha256').update(JSON.stringify(JSON.parse(JSON.stringify(data)))).digest('hex') }

export { getFromCache, setInCache, createHashKey }
