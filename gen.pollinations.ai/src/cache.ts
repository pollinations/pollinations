import type { Logger } from "@logtape/logtape";

interface CacheOptions<TArgs extends unknown[]> {
    log: Logger;
    ttl: number;
    kv: KVNamespace;
    keyGenerator: (...args: TArgs) => string | Promise<string>;
}

interface CacheEntry<T> {
    value: T;
    ttl: number;
}

export function cached<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    options: CacheOptions<TArgs>,
): (...args: TArgs) => Promise<TReturn> {
    const { ttl, kv, keyGenerator, log } = options;

    return async (...args: TArgs): Promise<TReturn> => {
        const cacheKey = await keyGenerator(...args);

        try {
            log.trace("Fetching from cache: {key}", { key: cacheKey });
            const cachedData = (await kv.get(
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

        log.trace("Executing function: {key}", { key: cacheKey });
        const result = await fn(...args);

        try {
            log.trace("Writing to cache: {key}", { key: cacheKey });
            const cacheEntry: CacheEntry<TReturn> = {
                value: result,
                ttl,
            };
            await kv.put(cacheKey, JSON.stringify(cacheEntry), {
                expirationTtl: ttl,
            });
        } catch (error) {
            log.warn("Failed to write to cache: {error}", { error });
        }

        return result;
    };
}
