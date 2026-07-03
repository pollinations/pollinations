import { TOKEN_STORAGE_KEY } from "../config";

export const getToken = (): string =>
    localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";

export const setToken = (t: string): void =>
    localStorage.setItem(TOKEN_STORAGE_KEY, t.trim());

export const clearToken = (): void =>
    localStorage.removeItem(TOKEN_STORAGE_KEY);
