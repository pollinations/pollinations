import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, readdirSync } from "node:fs";

// Mock fs modules
vi.mock("node:fs", () => ({
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(),
}));

vi.mock("node:os", () => ({
    homedir: vi.fn(() => "/home/testuser"),
}));

vi.mock("node:path", async () => {
    const actual = await vi.importActual("node:path");
    return {
        ...actual,
        join: vi.fn((...args: string[]) => args.join("/")),
    };
});

const { isCacheValid, getCached, setCached, clearCache, getCachedModels, setCachedModels } = await import("../../lib/cache.js");

describe("cache", () => {
    const now = Date.now();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(now);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("isCacheValid", () => {
        it("should return true for unexpired entry", () => {
            const entry = {
                data: { test: true },
                timestamp: now - 1000,
                ttl: 60,
            };
            expect(isCacheValid(entry)).toBe(true);
        });

        it("should return false for expired entry", () => {
            const entry = {
                data: { test: true },
                timestamp: now - 120_000,
                ttl: 60,
            };
            expect(isCacheValid(entry)).toBe(false);
        });

        it("should return true for entry with zero age", () => {
            const entry = {
                data: { test: true },
                timestamp: now,
                ttl: 3600,
            };
            expect(isCacheValid(entry)).toBe(true);
        });

        it("should return false when age equals TTL", () => {
            const entry = {
                data: { test: true },
                timestamp: now - 60_000,
                ttl: 60,
            };
            expect(isCacheValid(entry)).toBe(false);
        });
    });

    describe("getCached", () => {
        it("should return null when cache file does not exist", () => {
            vi.mocked(existsSync).mockReturnValue(false);
            const result = getCached("models", 3600);
            expect(result).toBeNull();
        });

        it("should return cached data when valid", () => {
            const mockData = { version: "1.0" };
            const entry = JSON.stringify({ data: mockData, timestamp: now - 1000, ttl: 3600 });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue(entry);
            const result = getCached<{ version: string }>("models", 3600);
            expect(result).toEqual(mockData);
        });

        it("should return null and delete expired cache", () => {
            const entry = JSON.stringify({ data: ["old"], timestamp: now - 7200_000, ttl: 3600 });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue(entry);
            const result = getCached("models", 3600);
            expect(result).toBeNull();
            expect(unlinkSync).toHaveBeenCalled();
        });

        it("should return null on parse error", () => {
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue("invalid json{{{");
            const result = getCached("models", 3600);
            expect(result).toBeNull();
        });
    });

    describe("setCached", () => {
        it("should create cache directory if it does not exist", () => {
            vi.mocked(existsSync).mockReturnValue(false);
            setCached("models", { key: "value" }, 3600);
            expect(mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining(".pollinations/cache"),
                { recursive: true, mode: 0o700 },
            );
        });

        it("should write cache entry with correct structure", () => {
            vi.mocked(existsSync).mockReturnValue(true);
            setCached("test-key", { name: "test" }, 120);
            expect(writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining("test-key.json"),
                expect.any(String),
                { encoding: "utf-8", mode: 0o600 },
            );
            const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1]);
            expect(written.data).toEqual({ name: "test" });
            expect(written.ttl).toBe(120);
            expect(written.timestamp).toBe(now);
        });

        it("should not re-create cache dir if it exists", () => {
            vi.mocked(existsSync).mockReturnValue(true);
            setCached("key", "value", 60);
            expect(mkdirSync).not.toHaveBeenCalled();
        });
    });

    describe("clearCache", () => {
        it("should clear specific cache file", () => {
            clearCache("models");
            expect(unlinkSync).toHaveBeenCalledWith(
                expect.stringContaining("models.json"),
            );
        });

        it("should clear all cache files when no key given", () => {
            vi.mocked(readdirSync).mockReturnValue(["models.json", "voices.json"]);
            clearCache();
            expect(unlinkSync).toHaveBeenCalledTimes(2);
        });

        it("should not throw if cache dir is empty", () => {
            vi.mocked(readdirSync).mockReturnValue([]);
            expect(() => clearCache()).not.toThrow();
        });

        it("should not throw if cache dir does not exist", () => {
            vi.mocked(readdirSync).mockImplementation(() => {
                throw new Error("ENOENT");
            });
            expect(() => clearCache()).not.toThrow();
        });

        it("should not throw when deleting specific file that does not exist", () => {
            vi.mocked(unlinkSync).mockImplementation(() => {
                throw new Error("ENOENT");
            });
            expect(() => clearCache("missing-key")).not.toThrow();
        });
    });

    describe("getCachedModels / setCachedModels", () => {
        it("should get models with default TTL of 1 hour", () => {
            vi.mocked(existsSync).mockReturnValue(false);
            const result = getCachedModels();
            expect(result).toBeNull();
        });

        it("should set models with default TTL of 1 hour", () => {
            const models = [{ name: "flux" }, { name: "openai" }];
            vi.mocked(existsSync).mockReturnValue(true);
            setCachedModels(models);
            const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1]);
            expect(written.data).toEqual(models);
            expect(written.ttl).toBe(3600);
        });
    });
});
