import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getOutputMode } from "./output.js";

export const NPM_PACKAGE = "@pollinations/cli";
export const NPM_REGISTRY = "https://registry.npmjs.org";
export const DISABLE_ENV = "POLLI_NO_UPDATE_NOTICES";
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // at most one network check per day

interface CachedCheck {
    latest: string;
    checkedAt: number;
}

const parseVersion = (version: string): number[] | null => {
    const parts = version.split("-")[0].split(".").map(Number);
    if (
        parts.length !== 3 ||
        parts.some((n) => !Number.isInteger(n) || n < 0)
    ) {
        return null;
    }
    return parts;
};

/** Semver-ish comparison; true if latest > current. Prerelease tags ignored. */
export const isNewerVersion = (latest: string, current: string): boolean => {
    const a = parseVersion(latest);
    const b = parseVersion(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
};

export const updateCachePath = (): string =>
    join(
        process.env.POLLINATIONS_CONFIG_DIR ?? join(homedir(), ".pollinations"),
        "update-check.json",
    );

export const readLastCheck = async (
    file = updateCachePath(),
): Promise<CachedCheck | null> => {
    try {
        const raw = JSON.parse(await readFile(file, "utf-8")) as CachedCheck;
        if (
            typeof raw.latest !== "string" ||
            typeof raw.checkedAt !== "number"
        ) {
            return null;
        }
        return raw;
    } catch {
        return null;
    }
};

const writeLastCheck = async (check: CachedCheck, file: string) => {
    try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(check), "utf-8");
    } catch {
        // cache is best-effort
    }
};

/** Fetch the latest stable version from the npm registry. Never throws. */
export const fetchLatestVersion = async (
    pkg = NPM_PACKAGE,
    registry = NPM_REGISTRY,
): Promise<string | null> => {
    try {
        const res = await fetch(`${registry}/${pkg}/latest`, {
            signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { version?: unknown };
        return typeof data.version === "string" ? data.version : null;
    } catch {
        return null;
    }
};

/**
 * Best-effort update check for interactive runs: cached for a day, never
 * throws, skipped entirely for machine-readable (--json) output or when
 * POLLI_NO_UPDATE_NOTICES is set. Returns the notice text, or null.
 */
export const checkForUpdate = async (
    currentVersion: string,
    file = updateCachePath(),
): Promise<string | null> => {
    if (getOutputMode() === "json") return null;
    if (
        process.env[DISABLE_ENV] === "1" ||
        process.env[DISABLE_ENV] === "true"
    ) {
        return null;
    }

    const cached = await readLastCheck(file);
    const now = Date.now();
    let latest: string | null;

    if (cached && now - cached.checkedAt < CHECK_INTERVAL_MS) {
        latest = cached.latest; // fresh enough — no network on most runs
    } else {
        latest = await fetchLatestVersion();
        if (latest) {
            await writeLastCheck({ latest, checkedAt: now }, file);
        }
    }

    if (!latest || !isNewerVersion(latest, currentVersion)) return null;
    return formatUpdateNotice(currentVersion, latest);
};

/** The human-facing notice. Updating is always explicit — never automatic. */
export const formatUpdateNotice = (
    currentVersion: string,
    latestVersion: string,
): string =>
    `Update available: ${currentVersion} → ${latestVersion}. Run: polli update (or npm i -g ${NPM_PACKAGE}@latest). Disable notices: ${DISABLE_ENV}=1`;

export const printUpdateNotice = (notice: string | null) => {
    if (!notice) return;
    // stderr keeps stdout machine-readable for scripts piping polli output
    process.stderr.write(`\n${notice}\n`);
};
