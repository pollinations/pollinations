import { describe, it, expect, beforeEach, vi } from "vitest";

// Use stringContaining to avoid path separator issues on Windows vs Unix
const CONFIG_DIR_HINT = ".pollinations";
const CONFIG_FILE_HINT = "config.json";

function makeFs(overrides?: Record<string, unknown>) {
    return {
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        unlinkSync: vi.fn(),
        ...overrides,
    };
}

async function importConfig(fsMock: Record<string, unknown>) {
    vi.doMock("node:fs", () => fsMock);
    vi.doMock("node:os", () => ({ homedir: vi.fn(() => "/home/testuser") }));
    return await import("../../lib/config-store.js");
}

describe("config-store", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("should load empty config if file does not exist", async () => {
        const fs = makeFs({ existsSync: vi.fn(() => false) });
        const { loadConfig } = await importConfig(fs);
        expect(loadConfig()).toEqual({});
    });

    it("should load config from file", async () => {
        const mockConfig = { defaults: { model: { image: "flux" } } };
        const fs = makeFs({
            existsSync: vi.fn(() => true),
            readFileSync: vi.fn(() => JSON.stringify(mockConfig)),
        });
        const { loadConfig } = await importConfig(fs);
        expect(loadConfig()).toEqual(mockConfig);
    });

    it("should save config to file", async () => {
        const mockMkdirSync = vi.fn();
        const mockWriteFileSync = vi.fn();
        const fs = makeFs({
            existsSync: vi.fn(() => false),
            mkdirSync: mockMkdirSync,
            writeFileSync: mockWriteFileSync,
        });

        const { saveConfig } = await importConfig(fs);
        saveConfig({ defaults: { width: 2048 } });

        expect(mockMkdirSync).toHaveBeenCalledWith(
            expect.stringContaining(CONFIG_DIR_HINT),
            { recursive: true, mode: 0o700 },
        );
        expect(mockWriteFileSync).toHaveBeenCalledWith(
            expect.stringContaining(CONFIG_FILE_HINT),
            expect.any(String),
            { encoding: "utf-8", mode: 0o600 },
        );
    });

    it("should get config key", async () => {
        const fs = makeFs({
            existsSync: vi.fn(() => true),
            readFileSync: vi.fn(() => JSON.stringify({ defaults: { model: { image: "flux" } } })),
        });
        const { getConfigKey } = await importConfig(fs);
        expect(getConfigKey("defaults.model.image")).toBe("flux");
    });

    it("should return fallback for missing key", async () => {
        const fs = makeFs({
            existsSync: vi.fn(() => true),
            readFileSync: vi.fn(() => JSON.stringify({})),
        });
        const { getConfigKey } = await importConfig(fs);
        expect(getConfigKey("nonexistent", "fallback")).toBe("fallback");
    });

    it("should set config key", async () => {
        const mockWriteFileSync = vi.fn();
        const fs = makeFs({
            existsSync: vi.fn(() => true),
            readFileSync: vi.fn(() => JSON.stringify({})),
            writeFileSync: mockWriteFileSync,
        });

        const { setConfigKey } = await importConfig(fs);
        setConfigKey("defaults.model.image", "flux");

        expect(mockWriteFileSync).toHaveBeenCalled();
        const saved = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
        expect(saved.defaults.model.image).toBe("flux");
    });

    it("should remove config key", async () => {
        const mockWriteFileSync = vi.fn();
        const fs = makeFs({
            existsSync: vi.fn(() => true),
            readFileSync: vi.fn(() => JSON.stringify({ defaults: { model: { image: "flux" } } })),
            writeFileSync: mockWriteFileSync,
        });

        const { removeConfigKey } = await importConfig(fs);
        expect(removeConfigKey("defaults.model.image")).toBe(true);

        const saved = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
        expect(saved.defaults.model.image).toBeUndefined();
    });

    it("should clear config", async () => {
        const mockUnlinkSync = vi.fn();
        const fs = makeFs({ unlinkSync: mockUnlinkSync });

        const { clearConfig } = await importConfig(fs);
        clearConfig();

        expect(mockUnlinkSync).toHaveBeenCalledWith(
            expect.stringContaining(CONFIG_FILE_HINT),
        );
    });
});
