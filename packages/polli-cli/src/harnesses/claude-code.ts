import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    writeTextAtomic,
} from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";
import { keyUsageCount, waitForKeyUsageIncrease } from "./usage-proof.js";

const ID = "claude-code";
const LABEL = "Claude Code";
const DEFAULT_MODEL = "openai/gpt-6-sol";
const INSTALL = "Install Claude Code: https://claude.com/claude-code";
// gen serves no Claude Code model ids, so every alias, including haiku for
// background work, points at the Pollinations model.
const MODEL_VARS = [
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_FABLE_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
];

// Claude Code reads this file only when launched with --settings, so the
// native login and ~/.claude settings stay untouched.
const settingsPath = (ctx: HarnessContext) =>
    join(ctx.home, ".pollinations", "claude-code.json");

const readEnv = (ctx: HarnessContext): Record<string, string> => {
    try {
        return (
            JSON.parse(readTextIfExists(settingsPath(ctx)) ?? "{}").env ?? {}
        );
    } catch {
        return {};
    }
};

const status = (ctx: HarnessContext): HarnessResult => {
    const installed = commandExists("claude", ctx.env);
    const env = readEnv(ctx);
    const written =
        env.ANTHROPIC_BASE_URL === BASE_URL &&
        Boolean(env.ANTHROPIC_AUTH_TOKEN) &&
        Boolean(env.ANTHROPIC_MODEL);
    return {
        harness: ID,
        label: LABEL,
        installed,
        configured: installed && written,
        model: env.ANTHROPIC_MODEL || undefined,
        files: [settingsPath(ctx)],
        next: !installed
            ? INSTALL
            : !written
              ? "Run: polli harness claude-code on"
              : `Ready. Launch with: claude --settings "${settingsPath(ctx)}"`,
    };
};

// Runs Claude Code itself with the written settings, so ready means it works.
const smokeTest = (ctx: HarnessContext) => {
    const run = spawnSync(
        "claude",
        [
            "-p",
            "--settings",
            settingsPath(ctx),
            "--no-session-persistence",
            "Reply with exactly one word: pong",
        ],
        {
            cwd: tmpdir(),
            // Fail fast instead of retrying a broken setup for minutes.
            env: { ...ctx.env, CLAUDE_CODE_MAX_RETRIES: "1" },
            encoding: "utf-8",
            timeout: 180_000,
            windowsHide: true,
        },
    );
    if (run.error) throw run.error;
    if (run.status !== 0 || !/\bpong\b/i.test(run.stdout)) {
        throw new Error(
            `Claude Code smoke test failed: ${`${run.stdout}${run.stderr}`.trim().slice(0, 500)}`,
        );
    }
};

const configure = async (
    ctx: HarnessContext,
    apiKey: string,
    model: string,
): Promise<HarnessResult> => {
    const path = settingsPath(ctx);
    const previous = readTextIfExists(path);
    const env = {
        ANTHROPIC_BASE_URL: BASE_URL,
        ANTHROPIC_AUTH_TOKEN: apiKey,
        ...Object.fromEntries(MODEL_VARS.map((name) => [name, model])),
    };
    writeTextAtomic(path, `${JSON.stringify({ env }, null, 2)}\n`, 0o600);
    try {
        const before = await keyUsageCount(apiKey);
        const startedAt = Date.now();
        smokeTest(ctx);
        await waitForKeyUsageIncrease(apiKey, before, { afterMs: startedAt });
    } catch (error) {
        if (previous === null) removeIfExists(path);
        else writeTextAtomic(path, previous, 0o600);
        throw error;
    }
    return { ...status(ctx), smokeVerified: true };
};

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Use Pollinations in Claude Code through gen's Anthropic Messages API, with a separate settings file",
    restartHint:
        "Launch with: claude --settings ~/.pollinations/claude-code.json",

    async on(ctx, options) {
        if (!commandExists("claude", ctx.env)) {
            throw new Error(`Claude Code was not found. ${INSTALL}`);
        }
        const model = options.model ?? DEFAULT_MODEL;
        await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: readEnv(ctx).ANTHROPIC_AUTH_TOKEN || null,
            },
            { browser: options.browser },
        );
        return configure(ctx, apiKey, model);
    },

    off(ctx) {
        const existed = readTextIfExists(settingsPath(ctx)) !== null;
        removeIfExists(settingsPath(ctx));
        return {
            ...status(ctx),
            configured: false,
            outcome: existed ? "stripped" : "unchanged",
        };
    },

    status,
};
