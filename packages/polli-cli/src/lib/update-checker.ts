import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".pollinations");
const CACHE_FILE = join(CONFIG_DIR, "update-cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UpdateCache {
    lastChecked: number;
    latestVersion: string | null;
}

function loadCache(): UpdateCache | null {
    if (!existsSync(CACHE_FILE)) return null;
    try {
        const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
        if (
            typeof data.lastChecked === "number" &&
            typeof data.latestVersion === "string"
        ) {
            return data;
        }
        return null;
    } catch {
        return null;
    }
}

function saveCache(data: UpdateCache): void {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), {
        encoding: "utf-8",
    });
}

async function fetchLatestVersion(): Promise<string | null> {
    try {
        const res = await fetch(
            "https://registry.npmjs.org/@pollinations/cli/latest",
            {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(5000),
            },
        );
        if (!res.ok) return null;
        const data = (await res.json()) as { version?: string };
        return data.version ?? null;
    } catch {
        return null;
    }
}

function compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] ?? 0;
        const nb = pb[i] ?? 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

export interface UpdateInfo {
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
}

export async function checkForUpdate(
    currentVersion: string,
): Promise<UpdateInfo> {
    const cache = loadCache();
    const now = Date.now();

    let latestVersion: string | null = null;

    if (cache && now - cache.lastChecked < CACHE_TTL_MS) {
        latestVersion = cache.latestVersion;
    } else {
        latestVersion = await fetchLatestVersion();
        saveCache({ lastChecked: now, latestVersion });
    }

    const updateAvailable =
        latestVersion !== null &&
        compareVersions(latestVersion, currentVersion) > 0;

    return {
        currentVersion,
        latestVersion: latestVersion ?? currentVersion,
        updateAvailable,
    };
}

export function getUpdateMessage(info: UpdateInfo): string | null {
    if (!info.updateAvailable) return null;
    return `Update available: ${info.currentVersion} → ${info.latestVersion}`;
}

export function getUpdateCommand(): string {
    return "npm install -g @pollinations/cli@latest";
}
