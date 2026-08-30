import { join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import { readTextIfExists, writeTextAtomic } from "./fs.js";
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

const ID = "opencode";
const LABEL = "OpenCode";
const DEFAULT_MODEL = "deepseek";
const KEY_ENV = "POLLI_OPENCODE_API_KEY";
const _PLUGIN_NAME = "opencode-pollinations-plugin";

const opencodeHome = (ctx: HarnessContext) =>
    join(ctx.home, ".config", "opencode");
const configPath = (ctx: HarnessContext) =>
    join(opencodeHome(ctx), "opencode.json");
const envPath = (ctx: HarnessContext) => join(opencodeHome(ctx), ".env");
const skillPath = (ctx: HarnessContext) =>
    join(opencodeHome(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [
    configPath(ctx),
    envPath(ctx),
    skillPath(ctx),
];

const readConfig = (ctx: HarnessContext): Record<string, unknown> => {
    const text = readTextIfExists(configPath(ctx));
    if (!text) return {};
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        return {};
    }
};

const writeConfig = (ctx: HarnessContext, config: Record<string, unknown>) => {
    writeTextAtomic(configPath(ctx), `${JSON.stringify(config, null, 2)}\n`);
};

const readKey = (ctx: HarnessContext) => {
    const text = readTextIfExists(envPath(ctx));
    if (!text) return null;
    const match = text.match(new RegExp(`^${KEY_ENV}=(.+)$`, "m"));
    return match?.[1] ?? null;
};

const setEnvKey = (ctx: HarnessContext, key: string) => {
    const lines = (readTextIfExists(envPath(ctx)) ?? "").split("\n");
    const idx = lines.findIndex((l) => l.startsWith(`${KEY_ENV}=`));
    const line = `${KEY_ENV}=${key}`;
    if (idx === -1) {
        lines.push(line);
    } else {
        lines[idx] = line;
    }
    writeTextAtomic(envPath(ctx), lines.join("\n"), 0o600);
};

const deleteEnvKey = (ctx: HarnessContext) => {
    const text = readTextIfExists(envPath(ctx));
    if (!text) return false;
    const lines = text.split("\n").filter((l) => !l.startsWith(`${KEY_ENV}=`));
    writeTextAtomic(envPath(ctx), lines.join("\n"), 0o600);
    return true;
};

const providerBlock = (models: HarnessModel[]) => ({
    name: "pollinations",
    displayName: "Pollinations.ai",
    type: "openai",
    baseUrl: `${BASE_URL}/v1`,
    apiKey: `\${env:${KEY_ENV}}`,
    models: models.map((m) => ({
        id: m.id,
        name: m.id,
        contextLength: m.contextWindow,
    })),
});

const patchConfig = (
    config: Record<string, unknown>,
    models: HarnessModel[],
) => {
    const providers = (config.providers ?? []) as Array<
        Record<string, unknown>
    >;
    const filtered = providers.filter((p) => p.name !== "pollinations");
    filtered.push(providerBlock(models));
    config.providers = filtered;
    return config;
};

const stripPollinations = (config: Record<string, unknown>) => {
    const providers = config.providers as
        | Array<Record<string, unknown>>
        | undefined;
    if (Array.isArray(providers)) {
        config.providers = providers.filter((p) => p.name !== "pollinations");
    }
    return config;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = readConfig(ctx);
    const providers = config.providers as
        | Array<Record<string, unknown>>
        | undefined;
    const has =
        Array.isArray(providers) &&
        providers.some((p) => p.name === "pollinations" && p.type === "openai");
    return {
        harness: ID,
        label: LABEL,
        configured:
            has &&
            readKey(ctx) !== null &&
            readTextIfExists(skillPath(ctx)) !== null,
        files: files(ctx),
    };
};

export const opencode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure OpenCode as a Pollinations provider",
    restartHint: "Restart OpenCode to apply changes",

    async on(ctx, options) {
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((c) => c.id === model)) {
            throw new Error(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        }

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );

        applyWithSnapshot(ctx, ID, files(ctx), () => {
            const config = readConfig(ctx);
            const patched = patchConfig(config, models);
            writeConfig(ctx, patched);
            setEnvKey(ctx, apiKey);
            if (readTextIfExists(skillPath(ctx)) === null) {
                writeTextAtomic(
                    skillPath(ctx),
                    `# Pollinations Skill\n\nUse Pollinations models via the configured provider.`,
                    0o600,
                );
            }
        });

        return result(ctx);
    },

    off(ctx) {
        const managedFiles = files(ctx);
        let outcome: HarnessResult["outcome"] = "restored";
        if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
            const config = readConfig(ctx);
            stripPollinations(config);
            writeConfig(ctx, config);
            deleteEnvKey(ctx);
            outcome = "stripped";
        }
        clearSnapshot(ctx, ID, managedFiles);
        return { ...result(ctx), configured: false, outcome };
    },

    status: result,
};
