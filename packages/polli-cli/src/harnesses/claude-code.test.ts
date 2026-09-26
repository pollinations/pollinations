import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CcrConfig } from "./ccr.js";
import type { HarnessContext } from "./types.js";

const mocks = vi.hoisted(() => ({
    resolveHarnessKey: vi.fn(
        async (harness: { existingKey: string | null }) =>
            harness.existingKey ?? "sk_child",
    ),
    fetchHarnessModels: vi.fn(async (selected: string) => [
        { id: selected, contextWindow: 128000, input: ["text"] },
        { id: "openai/gpt-5.4-nano", contextWindow: 128000, input: ["text"] },
    ]),
    keyUsageCount: vi.fn(async () => 4),
    waitForKeyUsageIncrease: vi.fn(async () => 5),
}));

vi.mock("./keys.js", () => ({
    resolveHarnessKey: mocks.resolveHarnessKey,
}));
vi.mock("./models.js", () => ({
    fetchHarnessModels: mocks.fetchHarnessModels,
}));
vi.mock("./usage-proof.js", () => ({
    keyUsageCount: mocks.keyUsageCount,
    waitForKeyUsageIncrease: mocks.waitForKeyUsageIncrease,
}));

import { ccrDir } from "./ccr.js";
import {
    ccrVersionCompatible,
    claudeCode,
    configureClaudeCode,
} from "./claude-code.js";

let home: string;
let bin: string;
let ctx: HarnessContext;
let server: Server;
let config: CcrConfig;
let version = "3.1.1";
let smokeStatus = 200;
let smokeBodies: Record<string, unknown>[] = [];

const foreignProvider = {
    id: "openrouter-user",
    name: "OpenRouter",
    provider: "openrouter",
    type: "openai_chat_completions",
    api_base_url: "https://openrouter.ai/api/v1",
    api_key: "foreign-key",
    models: ["x/y"],
};

const nativeProfile = {
    id: "default-claude",
    name: "Claude Code",
    agent: "claude-code",
    enabled: true,
    scope: "global",
    surface: "cli",
    model: "",
};

const executable = (name: string) => {
    const file = join(bin, process.platform === "win32" ? `${name}.cmd` : name);
    writeFileSync(
        file,
        process.platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\n",
    );
    chmodSync(file, 0o755);
};

beforeEach(async () => {
    mocks.resolveHarnessKey.mockClear();
    mocks.fetchHarnessModels.mockClear();
    mocks.keyUsageCount.mockClear();
    mocks.waitForKeyUsageIncrease.mockClear();

    home = mkdtempSync(join(tmpdir(), "polli-claude-harness-"));
    bin = join(home, "bin");
    mkdirSync(bin, { recursive: true });
    executable("ccr");
    executable("claude");

    config = {
        APIKEY: "ccr-local-gateway-key",
        Providers: [structuredClone(foreignProvider)],
        profile: {
            enabled: true,
            profiles: [structuredClone(nativeProfile)],
        },
    };
    version = "3.1.1";
    smokeStatus = 200;
    smokeBodies = [];

    server = createServer((request, response) => {
        let body = "";
        request.on("data", (chunk) => {
            body += chunk;
        });
        request.on("end", () => {
            const send = (status: number, value: unknown) => {
                response.writeHead(status, {
                    "content-type": "application/json",
                });
                response.end(JSON.stringify(value));
            };

            if (request.url === "/v1/messages") {
                smokeBodies.push(JSON.parse(body) as Record<string, unknown>);
                if (smokeStatus !== 200) {
                    send(smokeStatus, { error: { message: "forced failure" } });
                    return;
                }
                send(200, {
                    content: [{ type: "text", text: "pong" }],
                });
                return;
            }

            if (request.url !== "/api/ccr/rpc") {
                send(404, { error: "not found" });
                return;
            }

            const rpc = JSON.parse(body) as {
                method: string;
                args?: unknown[];
            };
            if (rpc.method === "getAppInfo") {
                send(200, { ok: true, value: { version } });
                return;
            }
            if (rpc.method === "getConfig") {
                send(200, { ok: true, value: config });
                return;
            }
            if (rpc.method === "saveConfig") {
                config = structuredClone(rpc.args?.[0]) as CcrConfig;
                send(200, { ok: true, value: config });
                return;
            }
            if (rpc.method === "getGatewayStatus") {
                const address = server.address() as { port: number };
                send(200, {
                    ok: true,
                    value: {
                        state: "running",
                        endpoint: `http://127.0.0.1:${address.port}`,
                    },
                });
                return;
            }
            send(200, { ok: false, error: { message: "unknown method" } });
        });
    });

    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as { port: number };

    ctx = {
        home,
        env: {
            PATH: [bin, process.env.PATH ?? ""].join(delimiter),
            PATHEXT: process.env.PATHEXT,
            APPDATA: home,
            CCR_CONFIG_DIR: join(home, "claude-code-router"),
        },
    };
    mkdirSync(ccrDir(ctx), { recursive: true });
    writeFileSync(
        join(ccrDir(ctx), "service.json"),
        JSON.stringify({
            pid: process.pid,
            url: `http://127.0.0.1:${address.port}/?ccr_web_token=test-token`,
        }),
    );
});

afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(home, { recursive: true, force: true });
});

describe("Claude Code harness", () => {
    it("checks the supported Claude Code Router version", () => {
        expect(ccrVersionCompatible("3.1.1")).toBe(true);
        expect(ccrVersionCompatible("3.2.0")).toBe(true);
        expect(ccrVersionCompatible("4.0.0")).toBe(true);
        expect(ccrVersionCompatible("3.1.0")).toBe(false);
        expect(ccrVersionCompatible("bad")).toBe(false);
    });

    it("stops before login or key creation when CCR is missing", async () => {
        const missing = { ...ctx, env: { ...ctx.env, PATH: "" } };
        await expect(claudeCode.on(missing, {})).rejects.toThrow(
            "Claude Code Router was not found",
        );
        expect(mocks.resolveHarnessKey).not.toHaveBeenCalled();
    });

    it("stops before login or key creation when Claude Code is missing", async () => {
        rmSync(
            join(bin, process.platform === "win32" ? "claude.cmd" : "claude"),
        );
        const missing = { ...ctx, env: { ...ctx.env, PATH: bin } };
        await expect(claudeCode.on(missing, {})).rejects.toThrow(
            "Claude Code was not found",
        );
        expect(mocks.resolveHarnessKey).not.toHaveBeenCalled();
    });

    it("requires an already-running CCR service before login/key creation", async () => {
        rmSync(join(ccrDir(ctx), "service.json"));
        await expect(claudeCode.on(ctx, {})).rejects.toThrow("not running");
        expect(mocks.resolveHarnessKey).not.toHaveBeenCalled();
    });

    it("rejects incompatible CCR before login/key creation", async () => {
        version = "3.1.0";
        await expect(claudeCode.on(ctx, {})).rejects.toThrow("unsupported");
        expect(mocks.resolveHarnessKey).not.toHaveBeenCalled();
    });

    it("preserves native config, adds an isolated provider/profile, and proves child-key usage", async () => {
        const result = await claudeCode.on(ctx, {
            model: "z-ai/glm-5.3-flash",
        });
        expect(result).toMatchObject({
            configured: true,
            model: "z-ai/glm-5.3-flash",
            smokeVerified: true,
            providerReady: true,
            profileReady: true,
        });
        expect(config.Providers).toContainEqual(foreignProvider);
        expect(config.profile.profiles).toContainEqual(nativeProfile);

        const provider = config.Providers.find(
            (item) => item.id === "pollinations-polli-harness",
        );
        expect(provider).toMatchObject({
            name: "Pollinations",
            api_base_url: "https://gen.pollinations.ai/v1",
            api_key: "sk_child",
            type: "openai_chat_completions",
        });
        const profile = config.profile.profiles.find(
            (item) => item.id === "pollinations-claude-code",
        );
        expect(profile).toMatchObject({
            agent: "claude-code",
            enabled: true,
            scope: "ccr",
            surface: "cli",
            model: "openai/z-ai/glm-5.3-flash",
        });
        expect(smokeBodies).toEqual([
            expect.objectContaining({
                model: "openai/z-ai/glm-5.3-flash",
            }),
        ]);
        expect(mocks.waitForKeyUsageIncrease).toHaveBeenCalledWith(
            "sk_child",
            4,
            expect.objectContaining({ afterMs: expect.any(Number) }),
        );
    });

    it("reuses the key stored in the CCR-owned provider", async () => {
        await claudeCode.on(ctx, { model: "openai/gpt-5.4-nano" });
        mocks.resolveHarnessKey.mockClear();
        await claudeCode.on(ctx, { model: "openai/gpt-5.4-mini" });
        expect(mocks.resolveHarnessKey).toHaveBeenCalledWith(
            expect.objectContaining({ existingKey: "sk_child" }),
            expect.anything(),
        );
    });

    it("refuses a foreign Pollinations-name collision before requesting a key", async () => {
        config.Providers.push({
            id: "somebody-else",
            name: "Pollinations",
            models: ["foreign/model"],
        });
        await expect(
            claudeCode.on(ctx, { model: "openai/gpt-5.4-nano" }),
        ).rejects.toThrow("different CCR provider");
        expect(mocks.resolveHarnessKey).not.toHaveBeenCalled();
    });

    it("rolls the complete CCR config back when the routed smoke fails", async () => {
        smokeStatus = 502;
        const before = structuredClone(config);
        await expect(
            claudeCode.on(ctx, { model: "openai/gpt-5.4-nano" }),
        ).rejects.toThrow("smoke test");
        expect(config).toEqual(before);
    });

    it("off removes only Polli-owned state and preserves later foreign edits", async () => {
        await claudeCode.on(ctx, { model: "openai/gpt-5.4-nano" });
        const laterProvider = {
            id: "later-provider",
            name: "Later",
            models: ["later/model"],
        };
        const laterProfile = {
            id: "later-profile",
            name: "Later profile",
            agent: "claude-code",
            enabled: true,
            scope: "ccr",
            surface: "cli",
            model: "Later/later/model",
        };
        config.Providers.push(laterProvider);
        config.profile.profiles.push(laterProfile);

        const result = await claudeCode.off(ctx);
        expect(result.outcome).toBe("stripped");
        expect(config.Providers).toContainEqual(foreignProvider);
        expect(config.Providers).toContainEqual(laterProvider);
        expect(config.profile.profiles).toContainEqual(nativeProfile);
        expect(config.profile.profiles).toContainEqual(laterProfile);
        expect(
            config.Providers.some(
                (item) => item.id === "pollinations-polli-harness",
            ),
        ).toBe(false);
        expect(
            config.profile.profiles.some(
                (item) => item.id === "pollinations-claude-code",
            ),
        ).toBe(false);
    });

    it("configureClaudeCode refuses an ownership collision without mutation", async () => {
        config.Providers.push({
            id: "pollinations-polli-harness",
            name: "Not Pollinations",
            api_base_url: "https://example.invalid",
            models: [],
        });
        const before = structuredClone(config);
        await expect(
            configureClaudeCode(ctx, {
                apiKey: "sk",
                model: "openai/gpt-5.4-nano",
                models: [
                    {
                        id: "openai/gpt-5.4-nano",
                        contextWindow: 128000,
                        input: ["text"],
                    },
                ],
            }),
        ).rejects.toThrow("foreign settings");
        expect(config).toEqual(before);
    });
});
