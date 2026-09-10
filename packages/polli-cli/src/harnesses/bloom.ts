import { join } from "node:path";
import { parseEnv } from "node:util";
import {
    commandExists,
    readTextIfExists,
    resolveHomePath,
    writeTextAtomic,
} from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

const ID = "bloom";
const LABEL = "Bloom CLI";
const KEY_ENV = "POLLINATIONS_API_KEY";

export const bloomHome = (ctx: HarnessContext) => {
    const configured = ctx.env.BLOOM_HOME;
    if (!configured?.trim()) return join(ctx.home, ".bloom");
    return resolveHomePath(ctx.home, configured);
};

const envPath = (ctx: HarnessContext) => join(bloomHome(ctx), ".env");
const files = (ctx: HarnessContext) => [envPath(ctx)];
const keyLine = new RegExp(`^\\s*(?:export\\s+)?${KEY_ENV}\\s*=`, "u");

const readKey = (ctx: HarnessContext) => {
    const text = readTextIfExists(envPath(ctx));
    if (text === null) return null;
    return parseEnv(text)[KEY_ENV] || null;
};

const setKey = (ctx: HarnessContext, key: string) => {
    const lines = (readTextIfExists(envPath(ctx)) ?? "").split("\n");
    const index = lines.findIndex((line) => keyLine.test(line));
    const filtered = lines.filter(
        (line, current) => current === index || !keyLine.test(line),
    );
    const value = `${KEY_ENV}=${JSON.stringify(key)}`;
    if (index === -1) {
        const insertAt =
            filtered.at(-1) === "" ? filtered.length - 1 : filtered.length;
        filtered.splice(insertAt, 0, value);
    } else filtered[index] = value;
    writeTextAtomic(envPath(ctx), filtered.join("\n"), 0o600);
};

const stripKey = (ctx: HarnessContext) => {
    const text = readTextIfExists(envPath(ctx));
    if (text === null) return false;
    const lines = text.split("\n");
    const filtered = lines.filter((line) => !keyLine.test(line));
    if (filtered.length === lines.length) return false;
    writeTextAtomic(envPath(ctx), filtered.join("\n"), 0o600);
    return true;
};

const result = (ctx: HarnessContext): HarnessResult => ({
    harness: ID,
    label: LABEL,
    configured: readKey(ctx) !== null,
    files: files(ctx),
});

export const configureBloom = (ctx: HarnessContext, apiKey: string) => {
    applyWithSnapshot(ctx, ID, files(ctx), () => setKey(ctx, apiKey));
    return result(ctx);
};

export const disableBloom = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripKey(ctx));
    return { ...result(ctx), configured: false, outcome };
};

export const bloom: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Create and configure a dedicated Pollinations key for Bloom",
    restartHint:
        "Changes apply on the next Bloom session. Start Bloom with: bloom",

    async on(ctx, options) {
        if (!commandExists("bloom", ctx.env)) {
            throw new Error(
                "Bloom was not found. Install it first: uv tool install bloom-cli",
            );
        }
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureBloom(ctx, apiKey);
    },

    off: disableBloom,
    status: result,
};
