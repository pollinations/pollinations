/**
 * Synchronous storage for API keys and OAuth state. Async adapters are unsupported.
 */
export interface StorageAdapter {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export type StorageOption = "localStorage" | "sessionStorage" | StorageAdapter;

const NOOP_STORAGE: StorageAdapter = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
};

export function resolveStorage(
    option: StorageOption | undefined,
): StorageAdapter {
    if (typeof window === "undefined") return NOOP_STORAGE;
    if (option && typeof option !== "string") return option;
    const name = option ?? "localStorage";
    // Access can throw in restricted browsers; defer it to the auth handlers.
    return {
        getItem: (key) => window[name].getItem(key),
        setItem: (key, value) => window[name].setItem(key, value),
        removeItem: (key) => window[name].removeItem(key),
    };
}
