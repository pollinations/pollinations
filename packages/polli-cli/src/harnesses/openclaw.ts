import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { printInfo, printSuccess } from "../lib/output.js";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import {
    applyWithSnapshot,
    clearSnapshot,
    restoreSnapshot,
} from "./snapshot.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "openclaw";
const LABEL = "OpenClaw";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "kimi";
const KEY_ENV = "POLLI_OPENCLAW_API_KEY";
const SKILL_ID = "polli";

const PROVIDER_PATH = ["models", "providers", PROVIDER];
const MODE_PATH = ["models", "mode"];
const ENV_VAR_PATH = ["env", "vars", KEY_ENV];
const DEFAULT_MODEL_PATH = ["agents", "defaults", "model", "primary"];

const INSTALL_HINT = [
    "OpenClaw is not installed. Run the official installer, then re-run this command:",
    "  macOS/Linux/WSL2:  curl -fsSL https://openclaw.ai/install.sh | bash",
    "  Windows:           iwr -useb https://openclaw.ai/install.ps1 | iex",
].join("\n");

const expandTilde = (home: string, value: string) =>
    value === "~"
        ? home
        : value.startsWith("~/") || value.startsWith("~\\")
          ? join(home, value.slice(2))
          : value;

/** ~/.openclaw by default; OPENCLAW_HOME or OPENCLAW_STATE_DIR relocate it. */
export const openclawStateDir = (ctx: HarnessContext) => {
    const stateDir = ctx.env.OPENCLAW_STATE_DIR;
    if (stateDir?.trim()) return resolve(expandTilde(ctx.home, stateDir));
    const home = ctx.env.OPENCLAW_HOME;
    const resolvedHome = !home?.trim()
        ? ctx.home
        : resolve(expandTilde(ctx.home, home));
    return join(resolvedHome, ".openclaw");
};

/** OPENCLAW_CONFIG_PATH points straight at the file, bypassing the state dir. */
export const openclawConfigPath = (ctx: HarnessContext) => {
    const configPath = ctx.env.OPENCLAW_CONFIG_PATH;
    if (configPath?.trim()) return resolve(expandTilde(ctx.home, configPath));
    return join(openclawStateDir(ctx), "openclaw.json");
};

const skillPath = (ctx: HarnessContext) =>
    join(openclawStateDir(ctx), "skills", SKILL_ID, "SKILL.md");

const files = (ctx: HarnessContext) => [
    openclawConfigPath(ctx),
    skillPath(ctx),
];

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const getPath = (obj: JsonObject, path: string[]): unknown =>
    path.reduce<unknown>(
        (node, key) => (isRecord(node) ? node[key] : undefined),
        obj,
    );

const setPath = (obj: JsonObject, path: string[], value: unknown) => {
    let node = obj;
    for (const key of path.slice(0, -1)) {
        if (!isRecord(node[key])) node[key] = {};
        node = node[key] as JsonObject;
    }
    node[path.at(-1) as string] = value;
};

const deletePath = (obj: JsonObject, path: string[]): boolean => {
    let node: unknown = obj;
    for (const key of path.slice(0, -1)) {
        if (!isRecord(node)) return false;
        node = node[key];
    }
    if (!isRecord(node) || !((path.at(-1) as string) in node)) return false;
    delete node[path.at(-1) as string];
    return true;
};

const readConfig = (ctx: HarnessContext): JsonObject => {
    const text = readTextIfExists(openclawConfigPath(ctx));
    if (text === null) return {};
    try {
        const parsed = JSON.parse(text);
        if (!isRecord(parsed)) {
            throw new Error("expected a JSON object at the top level");
        }
        return parsed;
    } catch (error) {
        throw new Error(
            `${openclawConfigPath(ctx)} is not valid JSON: ${(error as Error).message}`,
        );
    }
};

const writeConfig = (ctx: HarnessContext, config: JsonObject) =>
    writeTextAtomic(
        openclawConfigPath(ctx),
        `${JSON.stringify(config, null, 2)}\n`,
        0o600,
    );

const readKey = (ctx: HarnessContext): string | null => {
    const value = getPath(readConfig(ctx), ENV_VAR_PATH);
    return typeof value === "string" && value.length > 0 ? value : null;
};

const run = (bin: string, args: string[], env: NodeJS.ProcessEnv) =>
    spawnSync(bin, args, { stdio: "ignore", env });

const commandExists = (bin: string, env: NodeJS.ProcessEnv) => {
    const result = run(bin, ["--version"], env);
    return !result.error && result.status === 0;
};

/**
 * Missing binary: offer the official installation experience. Interactive
 * terminals get a yes/no prompt that runs the official installer; anything
 * else gets the printed commands, so scripts never hang on a prompt.
 */
const ensureInstalled = async (ctx: HarnessContext) => {
    if (commandExists("openclaw", ctx.env)) return;

    if (process.stdin.isTTY && process.stdout.isTTY) {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        let answer = "";
        try {
            answer = await rl.question(
                "OpenClaw is not installed. Run the official installer now? [y/N] ",
            );
        } finally {
            rl.close();
        }
        if (/^y(es)?$/i.test(answer.trim())) {
            const [bin, args] =
                process.platform === "win32"
                    ? [
                          "powershell",
                          [
                              "-NoProfile",
                              "-Command",
                              "iwr -useb https://openclaw.ai/install.ps1 | iex",
                          ],
                      ]
                    : [
                          "bash",
                          [
                              "-c",
                              "curl -fsSL https://openclaw.ai/install.sh | bash",
                          ],
                      ];
            const result = spawnSync(bin, args, {
                stdio: "inherit",
                env: ctx.env,
            });
            if (result.error) throw result.error;
            if (commandExists("openclaw", ctx.env)) {
                printSuccess("OpenClaw installed.");
                return;
            }
            throw new Error(
                "The installer finished, but `openclaw` is still not on PATH. Open a new shell, then re-run this command.",
            );
        }
    }
    throw new Error(INSTALL_HINT);
};

/**
 * Fresh installs need OpenClaw's own onboarding to create the workspace,
 * agent directory, and gateway token — a JSON config file alone is not
 * enough. This runs once, before the snapshot is taken, so the resulting
 * baseline config (not "no file at all") is what `off` restores to.
 */
const bootstrapOpenclaw = (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string },
) => {
    const result = run(
        "openclaw",
        [
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
            `${BASE_URL}/v1`,
            "--custom-provider-id",
            PROVIDER,
            "--custom-model-id",
            settings.model,
            "--custom-api-key",
            settings.apiKey,
            "--secret-input-mode",
            "plaintext",
            "--skip-channels",
            "--skip-daemon",
            "--skip-skills",
            "--skip-ui",
            "--skip-health",
        ],
        ctx.env,
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`openclaw onboard exited with code ${result.status}`);
    }
};

// Field names match the documented models.providers.<id> schema for custom
// providers (docs.openclaw.ai/concepts/model-providers). The key is stored
// once in env.vars and referenced with OpenClaw's ${VAR} substitution.
const providerConfig = (models: HarnessModel[]) => ({
    baseUrl: `${BASE_URL}/v1`,
    apiKey: `\${${KEY_ENV}}`,
    api: "openai-completions",
    models: models.map((model) => ({
        id: model.id,
        name: model.id,
        input: model.input,
        contextWindow: model.contextWindow,
    })),
});

interface OpenclawSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const applyConfig = (ctx: HarnessContext, settings: OpenclawSettings) => {
    const config = readConfig(ctx);
    setPath(config, PROVIDER_PATH, providerConfig(settings.models));
    // "merge" is OpenClaw's default; only set it when the user hasn't made
    // an explicit choice (e.g. "replace") already.
    if (getPath(config, MODE_PATH) === undefined) {
        setPath(config, MODE_PATH, "merge");
    }
    setPath(config, ENV_VAR_PATH, settings.apiKey);
    setPath(config, DEFAULT_MODEL_PATH, `${PROVIDER}/${settings.model}`);
    writeConfig(ctx, config);

    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext) => {
    const config = readConfig(ctx);
    let changed = deletePath(config, PROVIDER_PATH);
    const defaultModel = getPath(config, DEFAULT_MODEL_PATH);
    if (
        typeof defaultModel === "string" &&
        defaultModel.startsWith(`${PROVIDER}/`)
    ) {
        changed = deletePath(config, DEFAULT_MODEL_PATH) || changed;
    }
    changed = deletePath(config, ENV_VAR_PATH) || changed;
    if (changed) writeConfig(ctx, config);

    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = readConfig(ctx);
    const model = getPath(config, DEFAULT_MODEL_PATH);
    const provider = getPath(config, PROVIDER_PATH);
    const modelId =
        typeof model === "string" && model.startsWith(`${PROVIDER}/`)
            ? model.slice(PROVIDER.length + 1)
            : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            isRecord(provider) &&
            provider.apiKey === `\${${KEY_ENV}}` &&
            provider.api === "openai-completions" &&
            provider.baseUrl === `${BASE_URL}/v1` &&
            modelId !== undefined &&
            readKey(ctx) !== null &&
            readTextIfExists(skillPath(ctx)) !== null,
        model: modelId,
        files: files(ctx),
    };
};

export const configureOpenclaw = (
    ctx: HarnessContext,
    settings: OpenclawSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => applyConfig(ctx, settings));
    return result(ctx);
};

export const disableOpenclaw = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const openclaw: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure OpenClaw as a Pollinations provider",
    restartHint:
        "Changes apply on the next request. Restart a running gateway with: openclaw gateway restart",

    async on(ctx, options) {
        await ensureInstalled(ctx);

        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((candidate) => candidate.id === model)) {
            throw new Error(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        }

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );

        if (readTextIfExists(openclawConfigPath(ctx)) === null) {
            printInfo(
                "No OpenClaw config found — running the official onboarding flow first.",
            );
            bootstrapOpenclaw(ctx, { apiKey, model });
        }

        return configureOpenclaw(ctx, { apiKey, model, models });
    },

    off: disableOpenclaw,
    status: result,
};
