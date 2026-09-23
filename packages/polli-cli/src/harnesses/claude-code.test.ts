import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
    CcrRpcRunner,
    CcrService,
    ClaudeCodeStatePaths,
    RpcCall,
} from "./claude-code.js";
import {
    claudeCode,
    configureClaudeCode,
    disableClaudeCode,
    readServiceState,
    statePaths,
} from "./claude-code.js";
import type { HarnessContext, HarnessResult } from "./types.js";

const PROVIDER_ID = "pollinations";
const PROFILE_ID = "pollinations-claude-code";
const MARKER = "polli harness claude-code";
const MODELS = [
    {
        id: "deepseek/deepseek-v4-flash",
        contextWindow: 1048576,
        input: ["text"],
    },
    {
        id: "openai/gpt-5-nano",
        contextWindow: 400000,
        input: ["text", "image"],
    },
];

let home: string;
let ctx: HarnessContext;
let paths: () => ClaudeCodeStatePaths;
let service: CcrService;

/** Minimal pre-existing CCR config a user might already have. */
const baseConfig = () => ({
    Providers: [
        {
            id: "ollama-cloud",
            name: "Ollama Cloud",
            type: "openai_chat_completions",
            api_base_url: "https://ollama.example/v1",
            models: ["llama3"],
            enabled: true,
        },
    ],
    profile: {
        enabled: true,
        profiles: [
            {
                agent: "claude-code",
                enabled: true,
                id: "default-claude-code",
                name: "Claude Code",
                scope: "global",
                settingsFile: "~/.claude/settings.json",
                model: "",
            },
        ],
    },
    preferredProvider: "ollama-cloud",
});

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-claude-code-harness-"));
    ctx = { home, env: {} };
    paths = () => statePaths(ctx);
    mkdirSync(dirname(paths().service), { recursive: true });
    writeFileSync(
        paths().service,
        `${JSON.stringify({
            pid: 4321,
            url: "http://127.0.0.1:3458/?ccr_web_token=test-token",
        })}\n`,
    );
    service = { url: "http://127.0.0.1:3458/api/ccr/rpc", token: "test-token" };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const read = (path: string) => readFileSync(path, "utf-8");

interface FakeOptions {
    failOnSave?: boolean;
}

/** In-memory CCR config behind the RPC surface; no socket, no vi.mock. */
const makeRpc = (
    config: Record<string, unknown>,
    options: FakeOptions = {},
) => {
    const calls: RpcCall[] = [];
    let stored = structuredClone(config);
    const runner: CcrRpcRunner = (call) => {
        calls.push(call);
        if (call.method === "getConfig") {
            return { status: 200, value: structuredClone(stored) };
        }
        if (call.method === "saveConfig") {
            if (options.failOnSave) {
                return { status: 500, error: "simulated save failure" };
            }
            stored = structuredClone(call.args[0] as Record<string, unknown>);
            return { status: 200, value: structuredClone(stored) };
        }
        return { status: 404, error: `unknown method ${call.method}` };
    };
    return {
        runner,
        calls,
        stored: () => structuredClone(stored),
    };
};

const settings = () => ({
    apiKey: "sk_test_key",
    model: "deepseek/deepseek-v4-flash",
    models: MODELS,
    service,
});

const readStatus = (c: HarnessContext): HarnessResult =>
    claudeCode.status(c) as HarnessResult;

const providersOf = (config: Record<string, unknown>) =>
    config.Providers as Record<string, unknown>[];
const profilesOf = (config: Record<string, unknown>) =>
    (config.profile as { profiles: Record<string, unknown>[] }).profiles;

describe("claude-code harness", () => {
    it("reads the management service url and token from service.json", () => {
        expect(readServiceState(ctx)).toEqual(service);
    });

    it("configures CCR end to end and off restores the config byte-for-byte", async () => {
        const before = JSON.stringify(baseConfig());
        const rpc = makeRpc(baseConfig());

        const result = await configureClaudeCode(ctx, settings(), rpc.runner);
        expect(result).toMatchObject({ harness: "claude-code" });

        const config = rpc.stored();
        const provider = providersOf(config).find(
            (item) => item.id === PROVIDER_ID,
        );
        expect(provider).toMatchObject({
            name: "Pollinations",
            type: "openai_chat_completions",
            api_base_url: "https://gen.pollinations.ai/v1",
            api_key: "sk_test_key",
            enabled: true,
        });
        expect(provider?.models).toEqual([
            "deepseek/deepseek-v4-flash",
            "openai/gpt-5-nano",
        ]);
        expect(String(provider?.billing)).toContain(MARKER);

        const profile = profilesOf(config).find(
            (item) => item.id === PROFILE_ID,
        );
        expect(profile).toMatchObject({
            agent: "claude-code",
            name: "Pollinations",
            scope: "ccr",
            model: "deepseek/deepseek-v4-flash",
        });

        // Unrelated provider and profile survive.
        expect(providersOf(config).some((p) => p.id === "ollama-cloud")).toBe(
            true,
        );
        expect(
            profilesOf(config).some((p) => p.id === "default-claude-code"),
        ).toBe(true);

        expect(read(paths().key)).toBe("sk_test_key\n");
        expect(statSync(paths().key).mode & 0o777).toBe(0o600);
        // The key never appears on an RPC call's metadata beyond the config.
        expect(readStatus(ctx).configured).toBe(true);

        const off = await disableClaudeCode(ctx, rpc.runner);
        expect(off).toMatchObject({ configured: false, outcome: "restored" });
        expect(JSON.stringify(rpc.stored())).toBe(before);
        expect(existsSync(paths().key)).toBe(false);
    });

    it("strips only our entries after an outside edit to the config", async () => {
        const rpc = makeRpc(baseConfig());
        await configureClaudeCode(ctx, settings(), rpc.runner);

        // A user edits the config after `on`; a byte-for-byte restore is unsafe.
        const edited = rpc.stored();
        edited.preferredProvider = "pollinations";
        providersOf(edited).push({
            id: "user-added",
            name: "User Added",
            models: ["x"],
        });
        let stored = edited;
        const editRunner: CcrRpcRunner = (call) => {
            if (call.method === "getConfig") {
                return { status: 200, value: structuredClone(stored) };
            }
            if (call.method === "saveConfig") {
                stored = structuredClone(
                    call.args[0] as Record<string, unknown>,
                );
                return { status: 200, value: structuredClone(stored) };
            }
            return { status: 404, error: "unknown" };
        };

        const off = await disableClaudeCode(ctx, editRunner);
        expect(off.outcome).toBe("stripped");
        expect(stored.preferredProvider).toBe("pollinations");
        expect(providersOf(stored).some((p) => p.id === PROVIDER_ID)).toBe(
            false,
        );
        expect(providersOf(stored).some((p) => p.id === "user-added")).toBe(
            true,
        );
        expect(profilesOf(stored).some((p) => p.id === PROFILE_ID)).toBe(false);
        expect(
            profilesOf(stored).some((p) => p.id === "default-claude-code"),
        ).toBe(true);
    });

    it("refuses a foreign provider that shares our id", async () => {
        const config = baseConfig();
        providersOf(config).push({
            id: PROVIDER_ID,
            name: "Someone Else",
            models: ["other"],
        });
        const rpc = makeRpc(config);
        await expect(
            configureClaudeCode(ctx, settings(), rpc.runner),
        ).rejects.toThrow(/does not own/);
    });

    it("rolls back a failed save and leaves no key or snapshot", async () => {
        const before = JSON.stringify(baseConfig());
        const rpc = makeRpc(baseConfig(), { failOnSave: true });
        await expect(
            configureClaudeCode(ctx, settings(), rpc.runner),
        ).rejects.toThrow(/failed/);
        expect(JSON.stringify(rpc.stored())).toBe(before);
        expect(existsSync(paths().key)).toBe(false);
    });

    it("reports not configured when the management service is absent", () => {
        rmSync(paths().service, { force: true });
        expect(readServiceState(ctx)).toBeNull();
        expect(readStatus(ctx).configured).toBe(false);
    });

    it("on stops before any config change when the router is missing", async () => {
        const rpc = makeRpc(baseConfig());
        await expect(claudeCode.on(ctx, {})).rejects.toThrow(
            /Claude Code Router was not found/,
        );
        expect(rpc.calls).toHaveLength(0);
    });

    it("off is a no-op without the management service", async () => {
        rmSync(paths().service, { force: true });
        const rpc = makeRpc(baseConfig());
        const off = await disableClaudeCode(ctx, rpc.runner);
        expect(off).toMatchObject({ configured: false, outcome: "unchanged" });
        expect(rpc.calls).toHaveLength(0);
    });
});
