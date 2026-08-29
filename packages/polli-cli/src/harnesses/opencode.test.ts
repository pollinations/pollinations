import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { opencodeHarness } from "./opencode.js";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

const temporaryDirectories: string[] = [];
const spawnSyncMock = vi.mocked(spawnSync);

const testContext = async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "polli-opencode-"));
    temporaryDirectories.push(homeDir);
    return { env: {}, homeDir };
};

beforeEach(() => {
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({ status: 0 } as ReturnType<
        typeof spawnSync
    >);
});

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((path) => rm(path, { recursive: true, force: true })),
    );
});

describe("OpenCode harness", () => {
    it("adds the Pollinations plugin without replacing existing plugins", async () => {
        const context = await testContext();
        const configPath = join(
            context.homeDir,
            ".config",
            "opencode",
            "opencode.json",
        );
        await mkdir(join(context.homeDir, ".config", "opencode"), {
            recursive: true,
        });
        await writeFile(
            configPath,
            JSON.stringify({ plugin: ["existing-plugin"], theme: "dark" }),
        );

        const enabled = await opencodeHarness.on(context);
        const config = JSON.parse(await readFile(configPath, "utf-8"));

        expect(enabled).toMatchObject({ configured: true, changed: true });
        expect(config).toEqual({
            plugin: ["existing-plugin", "opencode-pollinations-plugin"],
            theme: "dark",
        });
    });

    it("is idempotent and reports the configured status", async () => {
        const context = await testContext();

        expect(await opencodeHarness.status(context)).toMatchObject({
            configured: false,
        });
        await opencodeHarness.on(context);
        expect(await opencodeHarness.on(context)).toMatchObject({
            configured: true,
            changed: false,
        });
        expect(await opencodeHarness.status(context)).toMatchObject({
            configured: true,
        });
    });

    it("removes only the Pollinations plugin", async () => {
        const context = await testContext();
        await opencodeHarness.on(context);
        const configPath = join(
            context.homeDir,
            ".config",
            "opencode",
            "opencode.json",
        );
        const config = JSON.parse(await readFile(configPath, "utf-8"));
        config.plugin.push("another-plugin");
        config.theme = "dark";
        await writeFile(configPath, JSON.stringify(config));

        expect(await opencodeHarness.off(context)).toMatchObject({
            configured: false,
            changed: true,
        });
        expect(JSON.parse(await readFile(configPath, "utf-8"))).toEqual({
            plugin: ["another-plugin"],
            theme: "dark",
        });
    });

    it("honors OPENCODE_CONFIG_DIR", async () => {
        const context = await testContext();
        const customDir = join(context.homeDir, "custom-opencode");

        const enabled = await opencodeHarness.on({
            ...context,
            env: { OPENCODE_CONFIG_DIR: customDir },
        });

        expect(enabled.configPath).toBe(join(customDir, "opencode.json"));
    });

    it("installs OpenCode before configuring a missing harness", async () => {
        const context = await testContext();
        spawnSyncMock
            .mockReturnValueOnce({ status: 1 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>);

        const enabled = await opencodeHarness.on(context);

        expect(spawnSyncMock).toHaveBeenNthCalledWith(
            2,
            "npm",
            ["install", "--global", "opencode-ai@latest"],
            { stdio: ["inherit", process.stderr, process.stderr] },
        );
        expect(enabled).toMatchObject({
            installed: true,
            configured: true,
        });
    });

    it("does not write config when the official installer fails", async () => {
        const context = await testContext();
        const configPath = join(
            context.homeDir,
            ".config",
            "opencode",
            "opencode.json",
        );

        spawnSyncMock
            .mockReturnValueOnce({ status: 1 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 1 } as ReturnType<typeof spawnSync>);

        await expect(opencodeHarness.on(context)).rejects.toThrow(
            "Official OpenCode installer exited with status 1",
        );
        await expect(readFile(configPath, "utf-8")).rejects.toMatchObject({
            code: "ENOENT",
        });
    });
});
