import { Logger } from "@logtape/logtape";

interface CacheOptions<TArgs extends any[]> {
    log: Logger;
    ttl: number;
    kv: KVNamespace;
    keyGenerator: (...args: TArgs) => string | Promise<string>;
    staleOnError?: boolean;
}

interface CacheEntry<T> {
    value: T;
    ttl: number;
}

/**
 * Creates a cached version of an async function using Cloudflare KV
 * @param fn The async function to cache
 * @param options Cache configuration options
 * @returns A cached version of the function
 */
export function cached<TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    options: CacheOptions<TArgs>,
): (...args: TArgs) => Promise<TReturn> {
    const { ttl, kv, keyGenerator, log, staleOnError } = options;

    return async (...args: TArgs): Promise<TReturn> => {
        const cacheKey = await keyGenerator(...args);
        let cachedData: CacheEntry<TReturn> | null = null;

        try {
            log.trace("Fetching from cache: {key}", { key: cacheKey });
            cachedData = (await kv.get(
                cacheKey,
                "json",
            )) as CacheEntry<TReturn> | null;
            if (cachedData) {
                const ttlChanged = cachedData.ttl !== ttl;
                if (!ttlChanged) {
                    return cachedData.value;
                }
            }
        } catch (error) {
            log.warn("Failed to read from cache: {error}", { error });
        }

        // refresh cache
        log.trace("Executing function: {key}", { key: cacheKey });
        try {
            const result = await fn(...args);

            try {
                log.trace("Writing to cache: {key}", { key: cacheKey });
                const cacheEntry: CacheEntry<TReturn> = {
                    value: result,
                    ttl: ttl,
                };
                await kv.put(cacheKey, JSON.stringify(cacheEntry), {
                    expirationTtl: ttl,
                });
            } catch (error) {
                log.warn("Failed to write to cache: {error}", { error });
            }

            return result;
        } catch (error) {
            // On error, return stale cached data if available and staleOnError is enabled
            if (staleOnError && cachedData) {
                log.warn("Function failed, returning stale cache: {key}", {
                    key: cacheKey,
                });
                return cachedData.value;
            }
            throw error;
        }
    };
}

/**
 * Creates a hash from function arguments for use as cache key (fallback)
 */
async function hashArgs(args: any[]): Promise<string> {
    const argsString = JSON.stringify(args, (_, value) => {
        if (typeof value === "function") {
            return value.toString();
        }
        if (value === undefined) {
            return "__undefined__";
        }
        return value;
    });

    // Create SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(argsString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
