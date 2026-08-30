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

const ID = "openclaw";
const LABEL = "OpenClaw";
const DEFAULT_MODEL = "deepseek";
const KEY_ENV = "POLLI_OPENCLAW_API_KEY";

const openclawHome = (ctx: HarnessContext) => join(ctx.home, ".openclaw");
const configPath = (ctx: HarnessContext) =>
    join(openclawHome(ctx), "openclaw.json");
const envPath = (ctx: HarnessContext) => join(openclawHome(ctx), ".env");
const skillPath = (ctx: HarnessContext) =>
    join(openclawHome(ctx), "skills", "polli", "SKILL.md");

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

const providerConfig = (models: HarnessModel[]) => ({
    baseUrl: `${BASE_URL}/v1`,
    apiKey: `\${env:${KEY_ENV}}`,
    models: models.map((m) => m.id),
});

const patchConfig = (
    config: Record<string, unknown>,
    models: HarnessModel[],
    _apiKey: string,
) => {
    const providers = (config.providers ?? {}) as Record<string, unknown>;
    providers.pollinations = providerConfig(models);
    config.providers = providers;

    const models_ = (config.models ?? {}) as Record<string, unknown>;
    models_.pollinations = {
        provider: "pollinations",
        model: DEFAULT_MODEL,
    };
    config.models = models_;
    return config;
};

const stripPollinations = (config: Record<string, unknown>) => {
    const providers = config.providers as Record<string, unknown> | undefined;
    if (providers) delete providers.pollinations;
    const models_ = config.models as Record<string, unknown> | undefined;
    if (models_) delete models_.pollinations;
    return config;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = readConfig(ctx);
    const providers = config.providers as Record<string, unknown> | undefined;
    const pollinations = providers?.pollinations as
        | Record<string, unknown>
        | undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            pollinations?.baseUrl === `${BASE_URL}/v1` &&
            readKey(ctx) !== null &&
            readTextIfExists(skillPath(ctx)) !== null,
        model: (config.models as Record<string, unknown>)?.pollinations
            ? ((
                  (config.models as Record<string, unknown>)
                      .pollinations as Record<string, unknown>
              )?.model as string)
            : undefined,
        files: files(ctx),
    };
};

export const openclaw: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure OpenClaw as a Pollinations provider",
    restartHint: "Restart OpenClaw to apply changes: openclaw restart",

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
            const patched = patchConfig(config, models, apiKey);
            writeConfig(ctx, patched);
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
            const config = readConfig(ctx);
            const stripped = stripPollinations(config);
            writeConfig(ctx, stripped);
            deleteEnvKey(ctx);
            const skill = readTextIfExists(skillPath(ctx));
            if (skill === polliSkill) {
                const fs = require("node:fs") as typeof import("node:fs");
                fs.unlinkSync(skillPath(ctx));
            }
            outcome = "stripped";
        }
        clearSnapshot(ctx, ID, managedFiles);
        return { ...result(ctx), configured: false, outcome };
    },

    status: result,
};
