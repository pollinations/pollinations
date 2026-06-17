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

/**
 * In-memory, frame-local storage. Used by `PolliProvider` when it runs inside
 * an iframe: a host-pushed (borrowed) session must never touch the app's own
 * `localStorage`, because same-origin standalone tabs share it — persisting the
 * borrowed key there would overwrite a standalone session, and clearing it on
 * host logout would wipe one. The key lives only for this frame's lifetime; the
 * host re-pushes it on every load, so nothing needs to persist in the frame.
 */
export function createMemoryStorage(): StorageAdapter {
    const map = new Map<string, string>();
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        },
        removeItem: (key) => {
            map.delete(key);
        },
    };
}
