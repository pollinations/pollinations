import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
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

const ID = "prime";
const LABEL = "Prime Agent";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "openai";
const INSTALL_CMD =
    "curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh";

export const primeHome = (ctx: HarnessContext) =>
    join(ctx.home, ".prime", "agent");

const modelsPath = (ctx: HarnessContext) => join(primeHome(ctx), "models.json");

const skillPath = (ctx: HarnessContext) =>
    join(primeHome(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [modelsPath(ctx), skillPath(ctx)];

const isPrimeInstalled = (ctx: HarnessContext): boolean => {
    if (existsSync(join(ctx.home, ".prime"))) return true;
    try {
        execSync("command -v pi", {
            stdio: "ignore",
            shell: true,
            timeout: 3000,
        });
        return true;
    } catch {
        return false;
    }
};

const readKey = (ctx: HarnessContext): string | null => {
    const text = readTextIfExists(modelsPath(ctx));
    if (!text) return null;
    try {
        const doc = JSON.parse(text) as {
            providers?: Record<string, { apiKey?: unknown }>;
        };
        const key = doc.providers?.[PROVIDER]?.apiKey;
        return typeof key === "string" && key.length > 0 ? key : null;
    } catch {
        return null;
    }
};

// The chosen default model sorts first so Prime Agent's model picker surfaces it.
const providerEntry = (
    apiKey: string,
    models: HarnessModel[],
    defaultModel: string,
) => {
    const sorted = [
        ...models.filter((m) => m.id === defaultModel),
        ...models.filter((m) => m.id !== defaultModel),
    ];
    return {
        baseUrl: `${BASE_URL}/v1`,
        api: "openai-completions",
        apiKey,
        compat: {
            supportsDeveloperRole: false,
            supportsReasoningEffort: true,
            supportsUsageInStreaming: true,
            supportsStrictMode: false,
        },
        models: sorted.map((m) => ({
            id: m.id,
            name: m.id,
            contextWindow: m.contextWindow,
            input: m.input,
        })),
    };
};

interface PrimeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writeConfig = (ctx: HarnessContext, settings: PrimeSettings) => {
    const existing: Record<string, unknown> = (() => {
        const text = readTextIfExists(modelsPath(ctx));
        if (!text) return {};
        try {
            return JSON.parse(text) as Record<string, unknown>;
        } catch {
            throw new Error(
                `${modelsPath(ctx)} is not valid JSON — fix it before running on`,
            );
        }
    })();

    const providers =
        (existing.providers as Record<string, unknown> | undefined) ?? {};
    providers[PROVIDER] = providerEntry(
        settings.apiKey,
        settings.models,
        settings.model,
    );
    existing.providers = providers;

    writeTextAtomic(
        modelsPath(ctx),
        `${JSON.stringify(existing, null, 2)}\n`,
        0o600,
    );
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext): boolean => {
    let changed = false;
    const text = readTextIfExists(modelsPath(ctx));
    if (text) {
        try {
            const doc = JSON.parse(text) as {
                providers?: Record<string, unknown>;
            };
            if (doc.providers && PROVIDER in doc.providers) {
                delete doc.providers[PROVIDER];
                writeTextAtomic(
                    modelsPath(ctx),
                    `${JSON.stringify(doc, null, 2)}\n`,
                    0o600,
                );
                changed = true;
            }
        } catch {
            // Leave corrupt files alone — user must fix manually.
        }
    }
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    let configured = false;
    let model: string | undefined;
    const text = readTextIfExists(modelsPath(ctx));
    if (text) {
        try {
            const doc = JSON.parse(text) as {
                providers?: Record<
                    string,
                    {
                        api?: string;
                        baseUrl?: string;
                        apiKey?: string;
                        models?: Array<{ id: string }>;
                    }
                >;
            };
            const p = doc.providers?.[PROVIDER];
            configured =
                p?.api === "openai-completions" &&
                p?.baseUrl === `${BASE_URL}/v1` &&
                typeof p?.apiKey === "string" &&
                p.apiKey.length > 0 &&
                readTextIfExists(skillPath(ctx)) !== null;
            model = p?.models?.[0]?.id;
        } catch {
            // JSON parse error → not configured
        }
    }
    return {
        harness: ID,
        label: LABEL,
        configured,
        model,
        files: files(ctx),
    };
};

export const configurePrime = (
    ctx: HarnessContext,
    settings: PrimeSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disablePrime = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const prime: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Prime Agent as a Pollinations provider",
    restartHint:
        "Changes apply on the next Prime Agent session. Start it with: pi",

    async on(ctx, options) {
        if (!isPrimeInstalled(ctx)) {
            throw new Error(
                `Prime Agent (pi) is not installed.\nInstall it with: ${INSTALL_CMD}`,
            );
        }

        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((m) => m.id === model)) {
            throw new Error(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        }

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );

        return configurePrime(ctx, { apiKey, model, models });
    },

    off: disablePrime,
    status: result,
};
