import { spawnSync } from "node:child_process";
import {
    chmodSync,
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gen } from "../lib/api.js";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
vi.mock("../lib/api.js", () => ({
    gen: vi.fn(async (path: string) => {
        if (path === "/account/key") {
            return {
                valid: true,
                type: "secret",
                permissions: { models: null },
            };
        }
        if (path === "/v1/models") {
            return {
                data: [
                    {
                        id: "kimi",
                        input_modalities: ["text", "image"],
                        output_modalities: ["text"],
                        supported_endpoints: ["/v1/chat/completions"],
                        tools: true,
                        context_length: 262000,
                    },
                    {
                        id: "deepseek",
                        input_modalities: ["text"],
                        output_modalities: ["text"],
                        supported_endpoints: ["/v1/chat/completions"],
                        tools: true,
                        context_length: 1048576,
                    },
                ],
            };
        }
        throw new Error(`Unexpected API path ${path}`);
    }),
    ApiError: class ApiError extends Error {
        status: number;
        constructor(status: number, message: string) {
            super(message);
            this.status = status;
        }
    },
}));

import {
    configureOpenclaw,
    disableOpenclaw,
    isOpenclawInstalled,
    openclaw,
    openclawConfigPath,
    runOpenclawOnboarding,
} from "./openclaw.js";
import { harnessSnapshotPath } from "./snapshot.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
];
const settings = { apiKey: "sk_openclaw_test", model: "kimi", models };

let home: string;
let ctx: HarnessContext;
const mockedSpawnSync = vi.mocked(spawnSync);
const mockedGen = vi.mocked(gen);

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-openclaw-"));
    ctx = { home, env: {} };
    mockedSpawnSync.mockReset();
    mockedSpawnSync.mockReturnValue({ status: 0 } as ReturnType<
        typeof spawnSync
    >);
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => openclawConfigPath(ctx);
const readConfig = () => JSON.parse(readFileSync(configFile(), "utf8"));

describe("openclaw paths", () => {
    it("uses explicit config, state dir, then OpenClaw home", () => {
        expect(
            openclawConfigPath({
                home,
                env: {
                    OPENCLAW_CONFIG_PATH: "~/custom.json",
                    OPENCLAW_STATE_DIR: "~/ignored",
                },
            }),
        ).toBe(join(home, "custom.json"));
        expect(
            openclawConfigPath({
                home,
                env: { OPENCLAW_STATE_DIR: "~/state" },
            }),
        ).toBe(join(home, "state", "openclaw.json"));
        expect(
            openclawConfigPath({ home, env: { OPENCLAW_HOME: "~/claw" } }),
        ).toBe(join(home, "claw", ".openclaw", "openclaw.json"));
        expect(openclawConfigPath({ home, env: {} })).toBe(
            join(home, ".openclaw", "openclaw.json"),
        );
    });
});

describe("openclaw lifecycle", () => {
    it("writes a fresh provider using an environment reference and live model shape", async () => {
        const result = configureOpenclaw(ctx, settings);
        expect(result).toMatchObject({
            harness: "openclaw",
            configured: true,
            model: "kimi",
        });
        const config = readConfig();
        expect(config.models.mode).toBe("merge");
        expect(config.models.providers.pollinations).toMatchObject({
            baseUrl: "https://gen.pollinations.ai/v1",
            api: "openai-completions",
            apiKey: `\${POLLI_OPENCLAW_API_KEY}`,
        });
        expect(
            config.models.providers.pollinations.models.map(
                (m: { id: string }) => m.id,
            ),
        ).toEqual(["kimi", "deepseek"]);
        expect(config.env.vars.POLLI_OPENCLAW_API_KEY).toBe(settings.apiKey);
        expect(config.agents.defaults.model.primary).toBe("pollinations/kimi");
        expect(config.tools.web.search).toEqual({
            provider: "perplexity",
            perplexity: {
                baseUrl: "https://gen.pollinations.ai/v1",
                apiKey: `\${POLLI_OPENCLAW_API_KEY}`,
                model: "perplexity-fast",
            },
        });
        expect(
            JSON.stringify(config.models.providers.pollinations),
        ).not.toContain(settings.apiKey);
        const snapshot = JSON.parse(
            readFileSync(
                harnessSnapshotPath(ctx, "openclaw", [configFile()]),
                "utf8",
            ),
        );
        expect(snapshot.metadata.openclaw).toMatchObject({
            provider: true,
            defaultModel: "kimi",
            modelsMode: true,
            keyEnv: "POLLI_OPENCLAW_API_KEY",
            webSearch: true,
        });
        await expect(openclaw.status(ctx)).resolves.toMatchObject({
            configured: true,
            model: "kimi",
        });
    });

    it("trims the secret key once before storing it", () => {
        configureOpenclaw(ctx, { ...settings, apiKey: "  sk_trimmed  " });
        expect(readConfig().env.vars.POLLI_OPENCLAW_API_KEY).toBe("sk_trimmed");
    });

    it("accepts catalog model ids with provider slashes", () => {
        const model = {
            id: "z-ai/glm-5.3-flash",
            contextWindow: 128000,
            input: ["text"],
        };
        configureOpenclaw(ctx, {
            ...settings,
            model: model.id,
            models: [model],
        });
        expect(readConfig().agents.defaults.model.primary).toBe(
            "pollinations/z-ai/glm-5.3-flash",
        );
    });

    it("reports false when a configured model loses chat-compatible metadata", async () => {
        configureOpenclaw(ctx, settings);
        const config = readConfig();
        config.models.providers.pollinations.models[0].input = ["audio"];
        writeFileSync(configFile(), `${JSON.stringify(config, null, 2)}\n`);
        await expect(openclaw.status(ctx)).resolves.toMatchObject({
            configured: false,
        });
    });

    it("reports false when a configured model id contains whitespace", async () => {
        configureOpenclaw(ctx, settings);
        const config = readConfig();
        config.models.providers.pollinations.models[0].id = "bad model";
        writeFileSync(configFile(), `${JSON.stringify(config, null, 2)}\n`);
        await expect(openclaw.status(ctx)).resolves.toMatchObject({
            configured: false,
        });
    });

    it("reports false when the owned web search model is changed", async () => {
        configureOpenclaw(ctx, settings);
        const config = readConfig();
        config.tools.web.search.perplexity.model = "user-model";
        writeFileSync(configFile(), `${JSON.stringify(config, null, 2)}\n`);
        await expect(openclaw.status(ctx)).resolves.toMatchObject({
            configured: false,
        });
    });

    it("reports false for a revoked configured key", async () => {
        configureOpenclaw(ctx, settings);
        mockedGen.mockResolvedValueOnce({ valid: false });
        await expect(openclaw.status(ctx)).resolves.toMatchObject({
            configured: false,
        });
    });

    it("reports false for a key restricted away from the configured model", async () => {
        configureOpenclaw(ctx, settings);
        mockedGen.mockResolvedValueOnce({
            valid: true,
            type: "secret",
            permissions: { models: ["deepseek"] },
        });
        await expect(openclaw.status(ctx)).resolves.toMatchObject({
            configured: false,
        });
    });

    it("reports false when the keyed catalog no longer contains the model", async () => {
        configureOpenclaw(ctx, settings);
        mockedGen.mockResolvedValueOnce({
            valid: true,
            type: "secret",
            permissions: { models: null },
        });
        mockedGen.mockResolvedValueOnce({ data: [] });
        await expect(openclaw.status(ctx)).resolves.toMatchObject({
            configured: false,
        });
    });

    it("merges Pollinations search fields into existing web search settings", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(
            configFile(),
            `${JSON.stringify(
                {
                    tools: {
                        web: {
                            search: {
                                provider: "brave",
                                brave: { apiKey: "user-secret" },
                                userField: true,
                            },
                        },
                    },
                },
                null,
                2,
            )}\n`,
        );
        configureOpenclaw(ctx, settings);
        expect(readConfig().tools.web.search).toMatchObject({
            provider: "perplexity",
            brave: { apiKey: "user-secret" },
            userField: true,
        });
    });

    it("preserves unrelated config and restores it byte-for-byte on off", () => {
        const original = `${JSON.stringify(
            {
                user: { keep: true },
                models: { mode: "replace" },
                agents: { defaults: { model: { primary: "other/model" } } },
            },
            null,
            2,
        )}\n`;
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(configFile(), original);
        configureOpenclaw(ctx, settings);
        expect(disableOpenclaw(ctx)).toMatchObject({
            outcome: "restored",
            configured: false,
        });
        expect(readFileSync(configFile(), "utf8")).toBe(original);
    });

    it("surgically removes owned fields after an edit and keeps user fields", () => {
        configureOpenclaw(ctx, settings);
        const config = readConfig();
        config.userField = "keep me";
        config.models.providers.pollinations.userField = "keep provider field";
        config.models.providers.pollinations.models = [{ id: "user-model" }];
        config.agents.defaults.model.primary = "user/model";
        config.tools.web.search.userField = "keep search field";
        writeFileSync(configFile(), `${JSON.stringify(config, null, 2)}\n`);

        expect(disableOpenclaw(ctx)).toMatchObject({
            outcome: "stripped",
            configured: false,
        });
        const cleaned = readConfig();
        expect(cleaned.userField).toBe("keep me");
        expect(cleaned.models.providers.pollinations).toEqual({
            userField: "keep provider field",
        });
        expect(cleaned.models.mode).toBeUndefined();
        expect(cleaned.env).toBeUndefined();
        expect(cleaned.agents).toBeUndefined();
        expect(cleaned.tools.web.search).toEqual({
            userField: "keep search field",
        });
    });

    it("keeps ownership sticky across reruns and removes models.mode", () => {
        configureOpenclaw(ctx, settings);
        configureOpenclaw(ctx, { ...settings, model: "deepseek" });
        const config = readConfig();
        config.user = "later";
        writeFileSync(configFile(), `${JSON.stringify(config, null, 2)}\n`);
        expect(disableOpenclaw(ctx)).toMatchObject({ outcome: "stripped" });
        const cleaned = readConfig();
        expect(cleaned.user).toBe("later");
        expect(cleaned.models).toBeUndefined();
    });

    it("rejects malformed config before writing a snapshot", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(configFile(), "[]\n");
        expect(() => configureOpenclaw(ctx, settings)).toThrow(/JSON object/);
        expect(existsSync(join(home, ".pollinations", "harnesses"))).toBe(
            false,
        );
    });
});

describe("openclaw preflight", () => {
    it("runs fresh-install onboarding with legacy options but no secret argv", () => {
        const executableDir = mkdtempSync(join(tmpdir(), "openclaw-bin-"));
        const executable = join(
            executableDir,
            process.platform === "win32" ? "openclaw.cmd" : "openclaw",
        );
        writeFileSync(executable, "");
        if (process.platform !== "win32") chmodSync(executable, 0o755);
        ctx.env.PATH = executableDir;
        runOpenclawOnboarding(ctx);
        const [command, args, options] = mockedSpawnSync.mock.calls[0];
        const expectedArgs = [
            "onboard",
            "--non-interactive",
            "--accept-risk",
            "--mode",
            "local",
            "--flow",
            "quickstart",
            "--auth-choice",
            "custom-api-key",
            "--custom-base-url",
            "https://gen.pollinations.ai/v1",
            "--custom-provider-id",
            "pollinations",
            "--custom-model-id",
            "kimi",
            "--custom-api-key",
            `\${POLLI_OPENCLAW_API_KEY}`,
            "--secret-input-mode",
            "plaintext",
            "--skip-channels",
            "--skip-daemon",
            "--skip-skills",
            "--skip-ui",
            "--skip-health",
        ];
        if (process.platform === "win32") {
            expect(command).toBe(process.env.ComSpec || "cmd.exe");
            expect(args).toEqual([
                "/d",
                "/c",
                expect.stringContaining(executable),
                ...expectedArgs,
            ]);
            expect(args).toContain(`\${POLLI_OPENCLAW_API_KEY}`);
        } else {
            expect(command).toBe(executable);
            expect(args).toEqual(expect.arrayContaining(expectedArgs));
        }
        expect(JSON.stringify(args)).not.toContain("sk_openclaw_test");
        expect(options).toMatchObject({
            cwd: home,
            stdio: ["ignore", "ignore", "ignore"],
        });
        mockedSpawnSync.mockReset();
        mockedSpawnSync.mockImplementation(() => {
            expect(
                readdirSync(join(home, ".pollinations", "harnesses")),
            ).toHaveLength(1);
            return { status: 0 } as ReturnType<typeof spawnSync>;
        });
        configureOpenclaw(ctx, { ...settings, onboard: true });
        rmSync(executableDir, { recursive: true, force: true });
    });

    it("skips onboarding when an existing config is initialized", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(configFile(), '{"user":{"keep":true}}\n');
        ctx.env.PATH = "";
        configureOpenclaw(ctx, { ...settings, onboard: true });
        expect(mockedSpawnSync).not.toHaveBeenCalled();
    });

    it("rolls back a failed fresh-install onboarding", () => {
        const executableDir = mkdtempSync(join(tmpdir(), "openclaw-bin-"));
        const executable = join(
            executableDir,
            process.platform === "win32" ? "openclaw.cmd" : "openclaw",
        );
        writeFileSync(executable, "");
        if (process.platform !== "win32") chmodSync(executable, 0o755);
        ctx.env.PATH = executableDir;
        mockedSpawnSync.mockReturnValue({ status: 1 } as ReturnType<
            typeof spawnSync
        >);
        expect(() =>
            configureOpenclaw(ctx, { ...settings, onboard: true }),
        ).toThrow(/onboarding failed/);
        expect(existsSync(configFile())).toBe(false);
        expect(readdirSync(join(home, ".pollinations", "harnesses"))).toEqual(
            [],
        );
        rmSync(executableDir, { recursive: true, force: true });
    });

    it("detects Windows command names and aborts before key work when absent", async () => {
        expect(isOpenclawInstalled({ home, env: { PATH: "" } })).toBe(false);
        await expect(openclaw.on(ctx, {})).rejects.toThrow(/not installed/);
    });
});
