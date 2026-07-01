import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR = join(homedir(), ".pollinations", "cache");
const MODELS_CACHE_FILE = join(CACHE_DIR, "models.json");

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number; // seconds
}

export function isCacheValid(entry: CacheEntry<unknown>): boolean {
    const now = Date.now();
    const age = (now - entry.timestamp) / 1000;
    return age < entry.ttl;
}

export function getCached<T>(key: string, ttl: number): T | null {
    const cacheFile = join(CACHE_DIR, `${key}.json`);
    if (!existsSync(cacheFile)) return null;
    try {
        const data = readFileSync(cacheFile, "utf-8");
        const entry = JSON.parse(data) as CacheEntry<T>;
        if (!isCacheValid(entry)) {
            // Remove expired
            try { unlinkSync(cacheFile); } catch { /* ignore */ }
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
}

export function setCached<T>(key: string, data: T, ttl: number): void {
    if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    }
    const cacheFile = join(CACHE_DIR, `${key}.json`);
    const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
    };
    writeFileSync(cacheFile, JSON.stringify(entry), { encoding: "utf-8", mode: 0o600 });
}

export function clearCache(key?: string): void {
    if (key) {
        const cacheFile = join(CACHE_DIR, `${key}.json`);
        try { unlinkSync(cacheFile); } catch { /* ignore */ }
        return;
    }
    try {
        const files = readdirSync(CACHE_DIR);
        for (const file of files) {
            try { unlinkSync(join(CACHE_DIR, file)); } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
}

// Helper for models cache
const MODELS_TTL = 3600; // 1 hour

export function getCachedModels<T>(): T | null {
    return getCached<T>("models", MODELS_TTL);
}

export function setCachedModels<T>(data: T): void {
    setCached("models", data, MODELS_TTL);
}

// Need to import readdirSync
import { readdirSync } from "node:fs";