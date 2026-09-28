/** In-memory public data only: share in-flight loads and reuse successful
 * results for five minutes. Never pass credentials or account data here. */
export function cachePublic<T, Args extends unknown[]>(
    load: (...args: Args) => Promise<T>,
) {
    const entries = new Map<
        string,
        { promise: Promise<T>; expiresAt: number }
    >();

    return (...args: Args): Promise<T> => {
        const key = JSON.stringify(args);
        const existing = entries.get(key);
        if (existing && Date.now() < existing.expiresAt)
            return existing.promise;

        const entry = {
            expiresAt: Infinity,
            promise: Promise.resolve().then(() => load(...args)),
        };
        entry.promise = entry.promise.then(
            (value) => {
                entry.expiresAt = Date.now() + 5 * 60_000;
                return value;
            },
            (error) => {
                entries.delete(key);
                throw error;
            },
        );
        entries.set(key, entry);
        return entry.promise;
    };
}
