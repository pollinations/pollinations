import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    checkForUpdate,
    getUpdateCommand,
    getUpdateMessage,
} from "./update-checker.js";

const CACHE_DIR = join(homedir(), ".pollinations");
const CACHE_FILE = join(CACHE_DIR, "update-cache.json");

function clearCache() {
    try {
        if (existsSync(CACHE_FILE)) rmSync(CACHE_FILE);
    } catch {}
}

function writeCache(data: {
    lastChecked: number;
    latestVersion: string | null;
}) {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

describe("update-checker", () => {
    beforeEach(() => {
        clearCache();
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        clearCache();
    });

    describe("checkForUpdate", () => {
        it("returns current version when latest is unknown", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockRejectedValue(new Error("network")),
            );
            const result = await checkForUpdate("1.0.0");
            expect(result.currentVersion).toBe("1.0.0");
            expect(result.updateAvailable).toBe(false);
        });

        it("detects newer version available", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({ version: "2.0.0" }),
                }),
            );
            const result = await checkForUpdate("1.0.0");
            expect(result.updateAvailable).toBe(true);
            expect(result.latestVersion).toBe("2.0.0");
        });

        it("no update when already on latest", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({ version: "1.0.0" }),
                }),
            );
            const result = await checkForUpdate("1.0.0");
            expect(result.updateAvailable).toBe(false);
            expect(result.latestVersion).toBe("1.0.0");
        });

        it("uses cache when within TTL", async () => {
            writeCache({ lastChecked: Date.now(), latestVersion: "3.0.0" });
            const fetchSpy = vi.fn();
            vi.stubGlobal("fetch", fetchSpy);
            const result = await checkForUpdate("1.0.0");
            expect(fetchSpy).not.toHaveBeenCalled();
            expect(result.updateAvailable).toBe(true);
            expect(result.latestVersion).toBe("3.0.0");
        });

        it("fetches when cache is expired", async () => {
            writeCache({
                lastChecked: Date.now() - 25 * 60 * 60 * 1000,
                latestVersion: "2.0.0",
            });
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({ version: "4.0.0" }),
                }),
            );
            const result = await checkForUpdate("1.0.0");
            expect(result.updateAvailable).toBe(true);
            expect(result.latestVersion).toBe("4.0.0");
        });
    });

    describe("getUpdateMessage", () => {
        it("returns message when update available", () => {
            const info = {
                currentVersion: "1.0.0",
                latestVersion: "2.0.0",
                updateAvailable: true,
            };
            expect(getUpdateMessage(info)).toBe(
                "Update available: 1.0.0 → 2.0.0",
            );
        });

        it("returns null when no update", () => {
            const info = {
                currentVersion: "1.0.0",
                latestVersion: "1.0.0",
                updateAvailable: false,
            };
            expect(getUpdateMessage(info)).toBeNull();
        });
    });

    describe("getUpdateCommand", () => {
        it("returns npm install command", () => {
            expect(getUpdateCommand()).toBe(
                "npm install -g @pollinations/cli@latest",
            );
        });
    });
});
