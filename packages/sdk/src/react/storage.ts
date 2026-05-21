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
