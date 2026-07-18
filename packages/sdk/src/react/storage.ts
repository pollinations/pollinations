/**
 * Synchronous key/value store for the user's session token and OAuth state.
 * Modeled on `window.localStorage` — implement against any sync backend
 * (cookies, in-memory, sessionStorage). Async backends (IndexedDB, RN
 * AsyncStorage) are out of scope.
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
    if (!option || option === "localStorage") return window.localStorage;
    if (option === "sessionStorage") return window.sessionStorage;
    return option;
}
