import { join } from "node:path";
import polliSkill from "../../SKILL.md?raw";
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

const ID = "pi";
const LABEL = "Pi";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "deepseek";
const KEY_ENV = "POLLI_PI_API_KEY";

const piHome = (ctx: HarnessContext) => join(ctx.home, ".pi");
const settingsPath = (ctx: HarnessContext) =>
    join(piHome(ctx), "settings.yaml");
const envPath = (ctx: HarnessContext) => join(piHome(ctx), ".env");
const skillPath = (ctx: HarnessContext) =>
    join(piHome(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [
    settingsPath(ctx),
    envPath(ctx),
    skillPath(ctx),
];

const readKey = (ctx: HarnessContext) => {
    const text = readTextIfExists(envPath(ctx));
    if (!text) return null;
    const match = text.match(new RegExp(`${KEY_ENV}=(.+)`, "m"));
    return match?.[1] ?? null;
};

const setEnvKey = (ctx: HarnessContext, key: string) => {
    const lines = (readTextIfExists(envPath(ctx)) ?? "").split("\n");
    const idx = lines.findIndex((l) => l.includes(KEY_ENV));
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
    const lines = text.split("\n").filter((l) => !l.includes(KEY_ENV));
    writeTextAtomic(envPath(ctx), lines.join("\n"), 0o600);
    return true;
};

const providerBlock = (models: HarnessModel[]) => ({
    displayName: "Pollinations.ai",
    apiKeyEnv: KEY_ENV,
    api: "openai-completions",
    baseURL: `${BASE_URL}/v1`,
    compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: true,
        supportsUsageInStreaming: true,
        supportsStrictMode: false,
        maxTokensField: "max_tokens",
    },
    models: models.map((m) => ({
        id: m.id,
        name: m.id,
        contextWindow: m.contextWindow,
        input: m.input,
        reasoningEfforts: false,
    })),
});

const result = (ctx: HarnessContext): HarnessResult => {
    const text = readTextIfExists(settingsPath(ctx)) ?? "";
    const hasProvider =
        text.includes(`"displayName": "Pollinations.ai"`) ||
        text.includes("displayName: Pollinations.ai");
    return {
        harness: ID,
        label: LABEL,
        configured:
            hasProvider &&
            readKey(ctx) !== null &&
            readTextIfExists(skillPath(ctx)) !== null,
        files: files(ctx),
    };
};

export const pi: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Pi as a Pollinations provider",
    restartHint: "Restart Pi to apply changes",

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
            writeTextAtomic(
                settingsPath(ctx),
                `${JSON.stringify(
                    {
                        providers: { [PROVIDER]: providerBlock(models) },
                        defaultModel: { provider: PROVIDER, model },
                    },
                    null,
                    2,
                )}\n`,
            );
            setEnvKey(ctx, apiKey);
            if (readTextIfExists(skillPath(ctx)) === null) {
                writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
            }
        });

        return result(ctx);
    },

    off(ctx) {
        const managedFiles = files(ctx);
        let outcome: HarnessResult["outcome"] = "restored";
        if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
            const text = readTextIfExists(settingsPath(ctx)) ?? "";
            if (text.includes("Pollinations.ai")) {
                const fs = require("node:fs") as typeof import("node:fs");
                try {
                    fs.unlinkSync(settingsPath(ctx));
                } catch {}
            }
            deleteEnvKey(ctx);
            const skill = readTextIfExists(skillPath(ctx));
            if (skill === polliSkill) {
                try {
                    const fs = require("node:fs") as typeof import("node:fs");
                    fs.unlinkSync(skillPath(ctx));
                } catch {}
            }
            outcome = "stripped";
        }
        clearSnapshot(ctx, ID, managedFiles);
        return { ...result(ctx), configured: false, outcome };
    },

    status: result,
};
