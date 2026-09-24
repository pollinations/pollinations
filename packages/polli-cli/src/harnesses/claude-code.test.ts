import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    type CcrConfig,
    claudeCode,
    claudeCodeStatus,
    claudeSettingsPath,
    configureClaudeCode,
    disableClaudeCode,
    readService,
} from "./claude-code.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "openai/gpt-5.4-nano", contextWindow: 128000, input: ["text"] },
    { id: "anthropic/claude-sonnet-5", contextWindow: 200000, input: ["text"] },
];
const settings = {
    apiKey: "sk_polli_test",
    model: "openai/gpt-5.4-nano",
    models,
};
const BASE_CONFIG: CcrConfig = {
    Providers: [
        {
            id: "deepseek",
            name: "deepseek",
            api_base_url: "https://api.deepseek.com",
            api_key: "sk_other",
            models: ["deepseek-chat"],
        },
    ],
    profile: {
        profiles: [
            {
                id: "default-claude-code",
                name: "Claude Code",
                agent: "claude-code",
                enabled: true,
                scope: "global",
                model: "deepseek,deepseek-chat",
                settingsFile: "~/.claude/settings.json",
            },
        ],
    },
};

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const ccrDir = () => join(home, ".claude-code-router");
const settingsFile = () => claudeSettingsPath(ctx);
// polli's marker also lives in this directory, so match only the snapshot files
// (`<id>.<12 hex chars>.json`).
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((file) =>
              /^claude-code\.[0-9a-f]{12}\.json$/.test(file),
          )
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");

/** An installed router: its config database exists before the server starts. */
const installRouter = () => {
    mkdirSync(ccrDir(), { recursive: true });
    writeFileSync(join(ccrDir(), "config.sqlite"), "");
};

/** Publish the service file the router writes, so the adapter can find its API. */
const publishService = (options: { pid?: number; token?: string } = {}) => {
    installRouter();
    writeFileSync(
        join(ccrDir(), "service.json"),
        JSON.stringify({
            pid: options.pid ?? process.pid,
            url: `http://127.0.0.1:3458/?ccr_web_token=${options.token ?? "test-token"}`,
        }),
    );
};

/** A management server that answers getConfig/saveConfig like the real one. */
const makeService = (initial: CcrConfig = BASE_CONFIG) => {
    let config = structuredClone(initial);
    const calls: { method: string; applyProfile?: boolean }[] = [];
    const fetchImpl = (async (_url: unknown, init: { body?: string }) => {
        const body = JSON.parse(String(init.body)) as {
            method: string;
            args: unknown[];
        };
        const options = body.args[1] as { applyProfile?: boolean } | undefined;
        calls.push({
            method: body.method,
            applyProfile: options?.applyProfile,
        });
        if (body.method === "getConfig") {
            return {
                ok: true,
                status: 200,
                json: async () => ({ ok: true, value: config }),
            };
        }
        if (body.method === "saveConfig") {
            config = structuredClone(body.args[0] as CcrConfig);
            return {
                ok: true,
                status: 200,
                json: async () => ({ ok: true, value: config }),
            };
        }
        return {
            ok: false,
            status: 400,
            json: async () => ({ ok: false, error: { message: "unknown" } }),
        };
    }) as unknown as typeof fetch;
    return { fetchImpl, calls, config: () => config };
};

/** What the router does to the client's settings when it applies a profile. */
const applySettings = () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
        settingsFile(),
        `${JSON.stringify({ env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:3456" }, permissions: { allow: [] } }, null, 2)}\n`,
    );
};

describe("claude-code harness", () => {
    it("adds the provider and an isolated Claude Code profile", async () => {
        publishService();
        const service = makeService();
        const result = await configureClaudeCode(ctx, settings, {
            fetchImpl: service.fetchImpl,
            applySettings,
        });

        expect(result).toMatchObject({
            harness: "claude-code",
            configured: true,
            model: "openai/gpt-5.4-nano",
        });
        const config = service.config();
        const provider = (config.Providers ?? []).find(
            (entry) => entry.id === "pollinations",
        );
        expect(provider).toMatchObject({
            api_base_url: "https://gen.pollinations.ai/v1",
            api_key: "sk_polli_test",
            models: ["openai/gpt-5.4-nano", "anthropic/claude-sonnet-5"],
        });
        const profile = (config.profile?.profiles ?? []).find(
            (entry) => entry.id === "pollinations",
        );
        // `scope: "ccr"` keeps the profile out of the user's global Claude Code
        // session: it only applies when Claude Code runs through this profile.
        expect(profile).toMatchObject({
            agent: "claude-code",
            scope: "ccr",
            model: "pollinations,openai/gpt-5.4-nano",
            settingsFile: "~/.claude/settings.json",
        });
        // The user's own provider and profile are carried through untouched.
        expect(
            (config.Providers ?? []).find((entry) => entry.id === "deepseek"),
        ).toBeTruthy();
        expect(
            (config.profile?.profiles ?? []).find(
                (entry) => entry.id === "default-claude-code",
            ),
        ).toBeTruthy();
        expect(read(settingsFile())).toContain("ANTHROPIC_BASE_URL");
        expect(service.calls.map((call) => call.method)).toContain(
            "saveConfig",
        );
        expect(snapshotFiles()).toHaveLength(1);
    });

    it("reuses the provider entry the router already holds", async () => {
        publishService();
        const service = makeService({
            ...BASE_CONFIG,
            Providers: [
                ...(BASE_CONFIG.Providers ?? []),
                {
                    id: "pollinations",
                    name: "pollinations",
                    api_base_url: "https://gen.pollinations.ai/v1",
                    api_key: "sk_existing",
                    models: ["openai/gpt-5.4-nano"],
                },
            ],
        });

        const result = await configureClaudeCode(
            ctx,
            // resolveHarnessKey is not part of this path, so the key the adapter
            // was handed is what lands in the config document.
            { ...settings, apiKey: "sk_existing" },
            { fetchImpl: service.fetchImpl, applySettings },
        );

        expect(result.configured).toBe(true);
        const provider = (service.config().Providers ?? []).find(
            (entry) => entry.id === "pollinations",
        );
        expect(provider?.api_key).toBe("sk_existing");
        // One entry only: the existing one is refreshed, never duplicated.
        expect(
            (service.config().Providers ?? []).filter(
                (entry) => entry.id === "pollinations",
            ),
        ).toHaveLength(1);
    });

    it("removes only its own entries and restores the client's settings", async () => {
        publishService();
        mkdirSync(join(home, ".claude"), { recursive: true });
        const original = `${JSON.stringify({ permissions: { allow: ["Bash"] } }, null, 2)}\n`;
        writeFileSync(settingsFile(), original);
        const service = makeService();
        await configureClaudeCode(ctx, settings, {
            fetchImpl: service.fetchImpl,
            applySettings,
        });

        const result = await disableClaudeCode(ctx, {
            fetchImpl: service.fetchImpl,
        });

        expect(result.outcome).toBe("restored");
        expect(read(settingsFile())).toBe(original);
        const config = service.config();
        expect(
            (config.Providers ?? []).some(
                (entry) => entry.id === "pollinations",
            ),
        ).toBe(false);
        expect(
            (config.profile?.profiles ?? []).some(
                (entry) => entry.id === "pollinations",
            ),
        ).toBe(false);
        expect(
            (config.Providers ?? []).some((entry) => entry.id === "deepseek"),
        ).toBe(true);
        // The removal must not re-apply the profile over the restored file.
        expect(
            service.calls.some(
                (call) =>
                    call.method === "saveConfig" && call.applyProfile === false,
            ),
        ).toBe(true);
        // And the merged provider/profile are gone from the saved document.
        expect(
            (service.config().profile?.profiles ?? []).map((entry) => entry.id),
        ).toEqual(["default-claude-code"]);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("leaves a settings file the user edited after `on` alone", async () => {
        publishService();
        mkdirSync(join(home, ".claude"), { recursive: true });
        writeFileSync(settingsFile(), "{}\n");
        const service = makeService();
        await configureClaudeCode(ctx, settings, {
            fetchImpl: service.fetchImpl,
            applySettings,
        });
        writeFileSync(settingsFile(), `${read(settingsFile())}// my edit\n`);

        const result = await disableClaudeCode(ctx, {
            fetchImpl: service.fetchImpl,
        });

        expect(result.outcome).toBe("stripped");
        expect(read(settingsFile())).toContain("// my edit");
        // Drift in the client document never leaves the router configured.
        expect(
            (service.config().Providers ?? []).some(
                (entry) => entry.id === "pollinations",
            ),
        ).toBe(false);
    });

    it("puts the client's settings back when the router fails mid-write", async () => {
        publishService();
        mkdirSync(join(home, ".claude"), { recursive: true });
        const original = `${JSON.stringify({ permissions: { allow: ["Bash"] } }, null, 2)}\n`;
        writeFileSync(settingsFile(), original);
        const service = makeService();
        // The router applies the profile and then rejects the save, which is
        // exactly the case the dedicated pre-image capture exists for: the
        // snapshot's post-hash would call this rewrite "user drift".
        const fetchImpl = (async (url: unknown, init: { body?: string }) => {
            const body = JSON.parse(String(init.body)) as { method: string };
            if (body.method === "saveConfig") {
                applySettings();
                throw new Error("router exploded");
            }
            return service.fetchImpl(url as never, init as never);
        }) as unknown as typeof fetch;

        await expect(
            configureClaudeCode(ctx, settings, { fetchImpl, applySettings }),
        ).rejects.toThrow(/router exploded/);

        expect(read(settingsFile())).toBe(original);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("stops with guidance when the router is installed but not running", async () => {
        installRouter();
        const service = makeService();

        await expect(
            configureClaudeCode(ctx, settings, {
                fetchImpl: service.fetchImpl,
            }),
        ).rejects.toThrow(/Claude Code Router is not running/);
        expect(readService(ctx)).toBe(null);
        await expect(claudeCode.status(ctx)).resolves.toMatchObject({
            configured: false,
        });
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("explains how to install the router when nothing is there", async () => {
        await expect(claudeCode.on(ctx, {})).rejects.toThrow(
            /Claude Code Router is required/,
        );
    });

    it("ignores a stale service file whose process is gone", () => {
        publishService({ pid: 999999 });
        expect(readService(ctx)).toBe(null);
    });

    it("explains how to authenticate when the router rejects the token", async () => {
        publishService();
        const fetchImpl = (async () => ({
            ok: false,
            status: 401,
            json: async () => ({ ok: false }),
        })) as unknown as typeof fetch;
        await expect(
            configureClaudeCode(ctx, settings, { fetchImpl }),
        ).rejects.toThrow(/CCR_WEB_AUTH_TOKEN/);
        expect(existsSync(settingsFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("reports not configured when the provider is missing", async () => {
        publishService();
        const service = makeService({
            Providers: [],
            profile: { profiles: [] },
        });
        await expect(
            claudeCodeStatus(ctx, { fetchImpl: service.fetchImpl }),
        ).resolves.toMatchObject({ configured: false });
    });

    it("honors CLAUDE_CONFIG_DIR and the router's own runtime overrides", () => {
        const custom = join(home, "cfg");
        expect(
            claudeSettingsPath({ home, env: { CLAUDE_CONFIG_DIR: custom } }),
        ).toBe(join(custom, "settings.json"));
        expect(
            claudeSettingsPath({ home, env: { CLAUDE_CONFIG_DIR: "  " } }),
        ).toBe(join(home, ".claude", "settings.json"));
        expect(
            claudeSettingsPath({
                home,
                env: { CLAUDE_CONFIG_DIR: "~/.claude-alt" },
            }),
        ).toBe(join(home, ".claude-alt", "settings.json"));
    });

    it("reads service.json from the directory the router actually uses", () => {
        const runtimeHome = join(home, "runtime-home");
        const overridden = {
            home,
            env: { CCR_INTERNAL_HOME_DIR: runtimeHome },
        };
        mkdirSync(join(runtimeHome, ".claude-code-router"), {
            recursive: true,
        });
        writeFileSync(
            join(runtimeHome, ".claude-code-router", "service.json"),
            JSON.stringify({
                pid: process.pid,
                url: "http://127.0.0.1:3458/?ccr_web_token=from-override",
            }),
        );

        expect(readService(overridden)).toEqual({
            origin: "http://127.0.0.1:3458",
            token: "from-override",
        });
        // The default home is not where it looked.
        expect(readService(ctx)).toBe(null);
    });
});
