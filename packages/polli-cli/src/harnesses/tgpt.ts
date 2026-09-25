import { join } from "node:path";
import { parseEnv } from "node:util";
import { commandExists, readTextIfExists, writeTextAtomic } from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

const ID = "tgpt";
const LABEL = "tgpt";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const MANAGED_KEYS = [
    "AI_PROVIDER",
    "POLLINATIONS_API_KEY",
    "POLLINATIONS_MODEL",
] as const;

const configPath = (ctx: HarnessContext) =>
    join(ctx.home, ".config", "tgpt", "config.conf");
const files = (ctx: HarnessContext) => [configPath(ctx)];
const managedLine = new RegExp(`^\\s*(?:${MANAGED_KEYS.join("|")})\\s*=`, "u");
// tgpt prioritizes AI_API_KEY over its provider-specific key, so `on` drops it.
const replacedLine = new RegExp(
    `^\\s*(${[...MANAGED_KEYS, "AI_API_KEY"].join("|")})\\s*=`,
    "u",
);

/** Add lines before the file's trailing newline, if any. */
const append = (lines: string[], added: string[]) =>
    lines.splice(
        lines.at(-1) === "" ? lines.length - 1 : lines.length,
        0,
        ...added,
    );

const readConfig = (ctx: HarnessContext) => {
    const text = readTextIfExists(configPath(ctx));
    return text === null ? {} : parseEnv(text);
};

const writeConfig = (ctx: HarnessContext, apiKey: string, model: string) => {
    const lines = (readTextIfExists(configPath(ctx)) ?? "")
        .split("\n")
        .filter((line) => !replacedLine.test(line));
    append(lines, [
        'AI_PROVIDER="pollinations"',
        `POLLINATIONS_API_KEY=${JSON.stringify(apiKey)}`,
        `POLLINATIONS_MODEL=${JSON.stringify(model)}`,
    ]);
    writeTextAtomic(configPath(ctx), lines.join("\n"), 0o600);
};

const stripConfig = (ctx: HarnessContext, before: string | null) => {
    const text = readTextIfExists(configPath(ctx));
    if (text === null) return false;
    const lines = text.split("\n");
    const provider = readConfig(ctx).AI_PROVIDER;
    const filtered = lines.filter(
        (line) =>
            !managedLine.test(line) ||
            (/^\s*AI_PROVIDER\s*=/u.test(line) && provider !== "pollinations"),
    );
    // Put back the user's own values that `on` replaced, unless set since.
    const kept = parseEnv(filtered.join("\n"));
    append(
        filtered,
        (before ?? "").split("\n").filter((line) => {
            const key = replacedLine.exec(line)?.[1];
            return key !== undefined && !(key in kept);
        }),
    );
    const next = filtered.join("\n");
    if (next === text) return false;
    writeTextAtomic(configPath(ctx), next, 0o600);
    return true;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = readConfig(ctx);
    const model = config.POLLINATIONS_MODEL || undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            config.AI_PROVIDER === "pollinations" &&
            Boolean(config.POLLINATIONS_API_KEY) &&
            Boolean(model),
        model,
        files: files(ctx),
    };
};

export const configureTgpt = (
    ctx: HarnessContext,
    apiKey: string,
    model = DEFAULT_MODEL,
) => {
    applyWithSnapshot(ctx, ID, files(ctx), () =>
        writeConfig(ctx, apiKey, model),
    );
    return result(ctx);
};

export const disableTgpt = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), (before) =>
        stripConfig(ctx, before(configPath(ctx))),
    );
    return { ...result(ctx), configured: false, outcome };
};

export const tgpt: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure tgpt to use authenticated Pollinations text models",
    restartHint: "Changes apply on the next tgpt session.",

    async on(ctx, options) {
        if (!commandExists("tgpt", ctx.env)) {
            throw new Error(
                "tgpt was not found. Install it first: https://github.com/aandrew-me/tgpt#installation",
            );
        }
        const existingKey = readConfig(ctx).POLLINATIONS_API_KEY || null;
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey },
            { browser: options.browser },
        );
        return configureTgpt(ctx, apiKey, options.model ?? DEFAULT_MODEL);
    },

    off: disableTgpt,
    status: result,
};
