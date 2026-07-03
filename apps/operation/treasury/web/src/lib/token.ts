import { APPEND_TOKEN_STORAGE_KEY, TOKEN_STORAGE_KEY } from "../config";

export const getToken = (): string =>
    localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";

export const setToken = (t: string): void =>
    localStorage.setItem(TOKEN_STORAGE_KEY, t.trim());

export const clearToken = (): void =>
    localStorage.removeItem(TOKEN_STORAGE_KEY);

export const getAppendToken = (): string =>
    localStorage.getItem(APPEND_TOKEN_STORAGE_KEY) ?? "";

export const setAppendToken = (t: string): void =>
    localStorage.setItem(APPEND_TOKEN_STORAGE_KEY, t.trim());

export const clearAppendToken = (): void =>
    localStorage.removeItem(APPEND_TOKEN_STORAGE_KEY);
