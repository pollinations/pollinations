import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HarnessContext } from "./types.js";

const spawnSyncMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawnSync: spawnSyncMock }));

const resolveHarnessKeyMock = vi.hoisted(() => vi.fn());
vi.mock("./keys.js", () => ({ resolveHarnessKey: resolveHarnessKeyMock }));

const fetchHarnessModelsMock = vi.hoisted(() => vi.fn());
vi.mock("./models.js", () => ({ fetchHarnessModels: fetchHarnessModelsMock }));

let home: string;
let ctx: HarnessContext;
let openclaw: typeof import("./openclaw.js").openclaw;

beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
    spawnSyncMock.mockReset();
    resolveHarnessKeyMock.mockReset().mockResolvedValue("sk_minted");
    fetchHarnessModelsMock
        .mockReset()
        .mockResolvedValue([
            { id: "kimi", contextWindow: 256000, input: ["text", "image"] },
        ]);
    ({ openclaw } = await import("./openclaw.js"));
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => join(home, ".openclaw", "openclaw.json");

describe("openclaw harness on()", () => {
    it("stops with the official installer when openclaw is not installed", async () => {
        spawnSyncMock.mockReturnValue({
            status: null,
            error: new Error("ENOENT"),
        });

        await expect(openclaw.on(ctx, {})).rejects.toThrow(
            /openclaw\.ai\/install\.sh/,
        );
        expect(fetchHarnessModelsMock).not.toHaveBeenCalled();
    });

    it("runs onboarding first on a fresh install, then writes the config", async () => {
        spawnSyncMock.mockImplementation((_bin: string, args: string[]) => {
            if (args[0] === "--version") return { status: 0, error: undefined };
            if (args[0] === "onboard") {
                // Simulate the CLI creating the baseline config.
                mkdirSync(join(home, ".openclaw"), { recursive: true });
                writeFileSync(
                    configFile(),
                    JSON.stringify({ workspace: join(home, "workspace") }),
                );
                return { status: 0, error: undefined };
            }
            return { status: 0, error: undefined };
        });

        const result = await openclaw.on(ctx, {});

        expect(result.configured).toBe(true);
        const onboardCall = spawnSyncMock.mock.calls.find(
            ([, args]) => args[0] === "onboard",
        );
        expect(onboardCall).toBeDefined();
        expect(onboardCall?.[1]).toContain("--non-interactive");
        expect(onboardCall?.[1]).toContain("sk_minted");

        const config = JSON.parse(readFileSync(configFile(), "utf-8"));
        // The pre-existing workspace value from "onboarding" survives.
        expect(config.workspace).toBe(join(home, "workspace"));
        expect(config.models.providers.pollinations).toBeDefined();
    });

    it("skips onboarding when a config already exists", async () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(configFile(), JSON.stringify({ workspace: "/existing" }));

        spawnSyncMock.mockReturnValue({ status: 0, error: undefined });

        await openclaw.on(ctx, {});

        expect(
            spawnSyncMock.mock.calls.some(([, args]) => args[0] === "onboard"),
        ).toBe(false);
    });

    it("rejects a model that is not in the current catalog", async () => {
        spawnSyncMock.mockReturnValue({ status: 0, error: undefined });

        await expect(
            openclaw.on(ctx, { model: "not-a-real-model" }),
        ).rejects.toThrow(/not a tool-calling text model/);
    });
});
