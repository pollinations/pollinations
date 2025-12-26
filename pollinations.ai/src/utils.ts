import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Wraps an async function to deduplicate concurrent calls with the same key.
 * While a promise is pending, subsequent calls with the same key return the same promise.
 */
export function memoizeAsync<T, Args extends unknown[]>(
    fn: (...args: Args) => Promise<T>,
    keyFn: (...args: Args) => string,
): (...args: Args) => Promise<T> {
    const pending = new Map<string, Promise<T>>();
    return (...args: Args) => {
        const key = keyFn(...args);
        const existing = pending.get(key);
        if (existing) return existing;

        const promise = fn(...args).finally(() => pending.delete(key));
        pending.set(key, promise);
        return promise;
    };
}
