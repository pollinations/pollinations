import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { printInfo, printSuccess, printWarn } from "../lib/output.js";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    writeTextAtomic,
} from "./fs.js";
import { keyIsValid, resolveHarnessKey, revokeHarnessKeys } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessOnOptions,
    HarnessResult,
} from "./types.js";

const ID = "claude-code";
const LABEL = "Claude Code (Claude Code Router)";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";

/**
 * Claude Code Router (musistudio/claude-code-router) has no documented CLI
 * or file interface for adding providers: they are created in its management
 * UI and stored in config.sqlite ("do not edit live"; the management RPC is
 * undocumented). So this adapter is a semi-automatic path by design:
 *
 *   on     installs/pins CCR, starts the service, opens the UI with exact
 *          values and a dedicated child key, then WAITS (read-only) until the
 *          user finishes in the UI and the result verifies;
 *   status reads config.sqlite READ-ONLY and reports the lifecycle state;
 *   off    verifies (read-only) that the user deleted the entries, then
 *          revokes the child key. It never writes to config.sqlite.
 *
 * Pinned to @musistudio/claude-code-router@3.1.1 (commit a034b0c).
 */
const CCR_PACKAGE = "@musistudio/claude-code-router";
const CCR_VERSION = "3.1.1";
const CCR_UI_URL = "http://127.0.0.1:3458";
const CCR_GATEWAY_URL = "http://127.0.0.1:3456";

const PROVIDER_NAME = "pollinations";
const PROVIDER_BASE_URL = "https://gen.pollinations.ai/v1";

type CcrProvider = {
    id?: string;
    name?: string;
    api_base_url?: string;
    baseUrl?: string;
    baseurl?: string;
    api_key?: string;
};

type CcrProfile = {
    id?: string;
    agent?: string;
    name?: string;
    providerId?: string;
    provider?: string;
    model?: string;
    enabled?: boolean;
};

export interface CcrConfig {
    providers: CcrProvider[];
    profiles: CcrProfile[];
}

interface CcrContextState {
    state:
        | "installed"
        | "service-up"
        | "awaiting-provider"
        | "awaiting-profile"
        | "verified";
    intent_at: string;
    /** Provider/profile ids present BEFORE our first `on` (ownership proof). */
    pre_provider_ids: string[];
    pre_profile_ids: string[];
    provider_id?: string;
    profile_id?: string;
    model?: string;
}

/** Injectable seams so tests can drive the adapter without network/TTY. */
export const claudeCodeDeps = {
    fetchModels: fetchHarnessModels,
    resolveKey: resolveHarnessKey,
    revokeKeys: revokeHarnessKeys,
    validateKey: keyIsValid,
    readConfig: undefined as
        | undefined
        | ((ctx: HarnessContext) => CcrConfig | null),
    openUrl: undefined as undefined | ((url: string) => void),
    isInteractive: () => Boolean(process.stdout.isTTY),
    sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
    waitCycles: 150, // 150 × 4 s ≈ 10 minutes of UI time
    ping: async (url: string): Promise<boolean> => {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(2000),
            });
            return response.status > 0;
        } catch {
            return false;
        }
    },
};

/* ---------------------------------------------------------------- paths */

const polliStateDir = (ctx: HarnessContext) =>
    join(ctx.home, ".pollinations", "harnesses", ID);
const contextPath = (ctx: HarnessContext) =>
    join(polliStateDir(ctx), "context.json");

/** Mirror of CCR's home resolution at 3.1.1 (CCR_INTERNAL_HOME_DIR → HOME). */
const ccrHome = (ctx: HarnessContext) => {
    const home =
        ctx.env.CCR_INTERNAL_HOME_DIR?.trim() ||
        ctx.env.HOME?.trim() ||
        ctx.env.USERPROFILE?.trim() ||
        ctx.home;
    return join(home, ".claude-code-router");
};
const ccrConfigDb = (ctx: HarnessContext) =>
    join(ccrHome(ctx), "config.sqlite");

/* ------------------------------------------------------- durable context */

const loadContext = (ctx: HarnessContext): CcrContextState | null => {
    const text = readTextIfExists(contextPath(ctx));
    if (text === null) return null;
    return JSON.parse(text) as CcrContextState;
};

const saveContext = (ctx: HarnessContext, state: CcrContextState) =>
    writeTextAtomic(
        contextPath(ctx),
        `${JSON.stringify(state, null, 2)}\n`,
        0o600,
    );

const clearContext = (ctx: HarnessContext) => removeIfExists(contextPath(ctx));

/* ------------------------------------------------------- read-only config */

/**
 * Read config.sqlite strictly read-only. node:sqlite needs Node ≥ 22.5; on
 * older runtimes we fail closed rather than guess at ownership.
 */
const readCcrConfig = (ctx: HarnessContext): CcrConfig => {
    if (claudeCodeDeps.readConfig) {
        return (
            claudeCodeDeps.readConfig(ctx) ?? { providers: [], profiles: [] }
        );
    }
    if (!existsSync(ccrConfigDb(ctx))) return { providers: [], profiles: [] };
    // node:sqlite ships with Node ≥ 22.5; resolved lazily so the CLI still
    // loads on Node 20 and only this path reports "config-unreadable".
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
        DatabaseSync: new (
            path: string,
            options: { readOnly: boolean },
        ) => {
            prepare(sql: string): { get(): unknown };
            close(): void;
        };
    };
    const db = new DatabaseSync(ccrConfigDb(ctx), { readOnly: true });
    try {
        const row = db
            .prepare("SELECT value_json FROM app_config WHERE key = 'default'")
            .get() as { value_json?: string } | undefined;
        return parseValueJson(row?.value_json);
    } finally {
        db.close();
    }
};

const parseValueJson = (valueJson: string | undefined): CcrConfig => {
    const parsed = valueJson ? JSON.parse(valueJson) : {};
    return {
        providers: Array.isArray(parsed.providers) ? parsed.providers : [],
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
    };
};

const providerBaseUrl = (provider: CcrProvider) =>
    (
        provider.api_base_url ||
        provider.baseUrl ||
        provider.baseurl ||
        ""
    ).replace(/\/+$/, "");

/** Ours = right name, right endpoint, and not present before our intent. */
const findOurProvider = (
    config: CcrConfig,
    state: CcrContextState | null,
): CcrProvider | null => {
    if (state?.provider_id) {
        const byId = config.providers.find((p) => p.id === state.provider_id);
        if (byId) return byId;
    }
    return (
        config.providers.find(
            (p) =>
                (p.name ?? "").trim().toLowerCase() === PROVIDER_NAME &&
                providerBaseUrl(p) === PROVIDER_BASE_URL &&
                (state === null ||
                    !state.pre_provider_ids.includes(p.id ?? "")),
        ) ?? null
    );
};

const findOurProfile = (
    config: CcrConfig,
    state: CcrContextState | null,
    provider: CcrProvider | null,
): CcrProfile | null => {
    if (!provider) return null;
    if (state?.profile_id) {
        const byId = config.profiles.find((p) => p.id === state.profile_id);
        if (byId) return byId;
    }
    return (
        config.profiles.find(
            (p) =>
                p.agent === "claude-code" &&
                (p.providerId === provider.id || p.provider === provider.id) &&
                (state === null || !state.pre_profile_ids.includes(p.id ?? "")),
        ) ?? null
    );
};

/** F2: verified requires provider + profile + matching model + enabled. */
const evaluate = (
    config: CcrConfig,
    state: CcrContextState | null,
    model: string | undefined,
): {
    state: CcrContextState["state"];
    provider: CcrProvider | null;
    profile: CcrProfile | null;
} => {
    const provider = findOurProvider(config, state);
    if (!provider) {
        return { state: "awaiting-provider", provider: null, profile: null };
    }
    const profile = findOurProfile(config, state, provider);
    const wanted = model ?? state?.model;
    const verified =
        profile !== null &&
        profile.enabled === true &&
        (wanted === undefined || profile.model === wanted);
    return {
        state: verified ? "verified" : "awaiting-profile",
        provider,
        profile: verified ? profile : null,
    };
};

/* --------------------------------------------------------- version gate */

class RefusedError extends Error {
    exitCode = 2;
}

const refuse = (message: string): never => {
    throw new RefusedError(message);
};

const ensureClaudeCli = (ctx: HarnessContext) => {
    if (!commandExists("claude", ctx.env)) {
        refuse(
            "Claude Code was not found. Install it first (https://claude.com/claude-code), then re-run `polli harness claude-code on`.",
        );
    }
    const ran = spawnSync("claude", ["--version"], {
        encoding: "utf-8",
        env: ctx.env,
    });
    const version = (ran.stdout ?? "").trim();
    const major = Number.parseInt(version, 10);
    if (ran.status !== 0 || !Number.isFinite(major) || major !== 2) {
        refuse(
            `Unsupported Claude Code version "${version || "empty"}" (verified on major 2.x). Refusing to mutate an unknown client.`,
        );
    }
};

const ccrVersion = (ctx: HarnessContext): string | null => {
    if (!commandExists("ccr", ctx.env)) return null;
    const ran = spawnSync("ccr", ["--version"], {
        encoding: "utf-8",
        env: ctx.env,
    });
    if (ran.status !== 0) return null;
    const match = (ran.stdout ?? "").match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
};

const ensureCcr = (ctx: HarnessContext) => {
    const installed = ccrVersion(ctx);
    if (installed === CCR_VERSION) return;
    if (installed !== null) {
        refuse(
            `Claude Code Router ${installed} is installed, but this integration is pinned to ${CCR_VERSION}. Install the pin with: npm i -g ${CCR_PACKAGE}@${CCR_VERSION}`,
        );
    }
    printInfo(
        `Installing Claude Code Router ${CCR_VERSION}: npm i -g ${CCR_PACKAGE}@${CCR_VERSION} ...`,
    );
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const install = spawnSync(
        npm,
        ["i", "-g", `${CCR_PACKAGE}@${CCR_VERSION}`],
        { stdio: "inherit", env: ctx.env },
    );
    if (install.status !== 0 || ccrVersion(ctx) !== CCR_VERSION) {
        refuse(
            `Could not install ${CCR_PACKAGE}@${CCR_VERSION}. Install it manually: npm i -g ${CCR_PACKAGE}@${CCR_VERSION}`,
        );
    }
};

const ensureService = async (ctx: HarnessContext) => {
    const start = spawnSync("ccr", ["start"], {
        encoding: "utf-8",
        env: { ...ctx.env, HOME: ctx.env.HOME ?? ctx.home },
        timeout: 60_000,
    });
    if (start.status !== 0) {
        refuse(
            `\`ccr start\` failed: ${(start.stderr ?? start.stdout ?? "").trim() || "unknown error"}`,
        );
    }
    for (let attempt = 0; attempt < 15; attempt += 1) {
        if (await claudeCodeDeps.ping(CCR_UI_URL)) return;
        await claudeCodeDeps.sleep(1000);
    }
    refuse(
        `The CCR management UI did not come up on ${CCR_UI_URL}. Check \`ccr serve\` output for errors.`,
    );
};

/* ------------------------------------------------------------------ on */

const printInstructions = (
    ctx: HarnessContext,
    state: CcrContextState,
    apiKey: string,
    model: string,
) => {
    printInfo("");
    printInfo("=== Finish the setup in the CCR management UI ===");
    printInfo(`URL: ${CCR_UI_URL}`);
    printInfo("");
    printInfo("1. Providers → Add Provider:");
    printInfo(`     name:      ${PROVIDER_NAME}`);
    printInfo(`     endpoint:  ${PROVIDER_BASE_URL}`);
    printInfo("     protocol:  OpenAI Chat (auto-detect)");
    printInfo(`     API key:   ${apiKey}`);
    printWarn(
        "This key is shown ONCE. It lives in your Pollinations account as polli-harness-claude-code; `polli harness claude-code off` revokes it.",
    );
    printInfo("");
    printInfo("2. Agent Config → Claude Code profile:");
    printInfo(`     provider:  ${PROVIDER_NAME}`);
    printInfo(`     model:     ${model}`);
    printInfo("     enabled:   true");
    printInfo("");
    printInfo("Waiting for the profile to verify (Ctrl+C to finish later)...");
    void ctx;
    void state;
};

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Configure Claude Code (via Claude Code Router) to use Pollinations",
    restartHint:
        "Launch Claude Code through the profile: ccr <profile-name-or-id> cli",

    async on(ctx: HarnessContext, options: HarnessOnOptions) {
        ensureClaudeCli(ctx);
        ensureCcr(ctx);
        await ensureService(ctx);

        const model = options.model ?? DEFAULT_MODEL;
        await claudeCodeDeps.fetchModels(model);

        let state = loadContext(ctx);
        const config = readCcrConfig(ctx);
        if (state === null) {
            state = {
                state: "service-up",
                intent_at: new Date().toISOString(),
                pre_provider_ids: config.providers.map((p) => p.id ?? ""),
                pre_profile_ids: config.profiles.map((p) => p.id ?? ""),
                model,
            };
        }
        state.model = model;
        saveContext(ctx, state);

        const evaluation = evaluate(config, state, model);
        if (evaluation.state === "verified") {
            state.state = "verified";
            state.provider_id = evaluation.provider?.id;
            state.profile_id = evaluation.profile?.id;
            saveContext(ctx, state);
            return statusResult(ctx, state, {
                configured: true,
                model,
                notes: ["Already verified; nothing to do."],
            });
        }
        if (evaluation.provider) {
            printInfo(
                `The provider exists but the profile is not fully configured for model ${model} - adjust it in the UI as below.`,
            );
        }

        const existingKey =
            typeof evaluation.provider?.api_key === "string" &&
            evaluation.provider.api_key.length > 5
                ? evaluation.provider.api_key
                : null;
        const apiKey = await claudeCodeDeps.resolveKey(
            { id: ID, label: LABEL, existingKey },
            { browser: options.browser },
        );

        printInstructions(ctx, state, apiKey, model);
        if (options.browser !== false && claudeCodeDeps.openUrl) {
            claudeCodeDeps.openUrl(CCR_UI_URL);
        }

        // Wait (read-only) until the user's UI entries verify. A user who
        // stops early can resume with another `on`; nothing is revoked.
        const cycles = claudeCodeDeps.isInteractive()
            ? claudeCodeDeps.waitCycles
            : 1;
        for (let cycle = 0; cycle < cycles; cycle += 1) {
            const current = evaluate(readCcrConfig(ctx), state, model);
            if (current.state === "verified") {
                state.state = "verified";
                state.provider_id = current.provider?.id;
                state.profile_id = current.profile?.id;
                saveContext(ctx, state);
                if (options.smoke) await smoke(ctx);
                return statusResult(ctx, state, {
                    configured: true,
                    model,
                    notes: [
                        "Provider and profile verified in CCR.",
                        "Check usage: polli usage --key polli-harness-claude-code --days 1",
                    ],
                });
            }
            if (current.state !== state.state) {
                state.state = current.state;
                state.provider_id = current.provider?.id ?? state.provider_id;
                saveContext(ctx, state);
                printInfo(`State: ${current.state}`);
            }
            await claudeCodeDeps.sleep(4000);
        }

        const pending = evaluate(readCcrConfig(ctx), state, model);
        state.state = pending.state;
        saveContext(ctx, state);
        return statusResult(ctx, state, {
            configured: false,
            model,
            state: pending.state,
            exitCode: 3,
            notes: [
                `Setup is waiting at "${pending.state}". Finish the steps above in ${CCR_UI_URL}, then re-run \`polli harness claude-code on\`.`,
            ],
        });
    },

    async off(ctx: HarnessContext) {
        const state = loadContext(ctx);
        const config = readCcrConfig(ctx);
        const provider = findOurProvider(config, state);
        const profile = findOurProfile(config, state, provider);

        if (provider || profile) {
            return statusResult(ctx, state, {
                configured: false,
                outcome: "unchanged",
                state: "manual-pending",
                exitCode: 3,
                notes: [
                    `Delete the "${PROVIDER_NAME}" provider and its Claude Code profile in ${CCR_UI_URL} first - CCR only supports deletion through its UI. Re-run \`polli harness claude-code off\` afterwards to revoke the key.`,
                ],
            });
        }

        const had = state !== null;
        await claudeCodeDeps.revokeKeys(ID);
        clearContext(ctx);
        return statusResult(ctx, null, {
            configured: false,
            outcome: had ? "stripped" : "unchanged",
            state: had ? "not-configured" : "not-configured",
            exitCode: had ? 0 : 4,
        });
    },

    async status(ctx: HarnessContext) {
        const state = loadContext(ctx);
        let config: CcrConfig;
        try {
            config = readCcrConfig(ctx);
        } catch (error) {
            return statusResult(ctx, state, {
                configured: false,
                state: "config-unreadable",
                exitCode: 2,
                notes: [
                    `Could not read ${ccrConfigDb(ctx)} read-only (needs Node ≥ 22.5 for node:sqlite): ${error instanceof Error ? error.message : error}`,
                ],
            });
        }
        if (!commandExists("ccr", ctx.env)) {
            return statusResult(ctx, state, {
                configured: false,
                state: "router-missing",
                exitCode: 2,
            });
        }
        if (!commandExists("claude", ctx.env)) {
            return statusResult(ctx, state, {
                configured: false,
                state: "client-missing",
                exitCode: 2,
            });
        }
        const evaluation = evaluate(config, state, state?.model);
        if (!evaluation.provider) {
            return statusResult(ctx, state, {
                configured: false,
                state: state ? "awaiting-provider" : "not-configured",
                exitCode: state ? 0 : 4,
            });
        }
        if (evaluation.state !== "verified") {
            return statusResult(ctx, state, {
                configured: false,
                state: "awaiting-profile",
                exitCode: 0,
                notes: [
                    `Provider found; finish the Claude Code profile in ${CCR_UI_URL} (provider + model ${state?.model ?? DEFAULT_MODEL} + enabled).`,
                ],
            });
        }
        const key = evaluation.provider.api_key;
        const valid =
            typeof key === "string" && (await claudeCodeDeps.validateKey(key));
        const gateway = await claudeCodeDeps.ping(CCR_GATEWAY_URL);
        return statusResult(ctx, state, {
            configured: valid,
            model: state?.model,
            state: valid ? "key-valid" : "key-invalid",
            exitCode: 0,
            notes: [
                `Gateway ${CCR_GATEWAY_URL}: ${gateway ? "reachable" : "not reachable"} (start it with \`ccr start\`).`,
                ...(valid
                    ? []
                    : [
                          "The stored key no longer validates - re-run `polli harness claude-code on`.",
                      ]),
            ],
        });
    },
};

const smoke = async (ctx: HarnessContext) => {
    if (await claudeCodeDeps.ping(CCR_GATEWAY_URL)) {
        printSuccess("CCR gateway is up.");
        printInfo(
            "A billable request through the gateway needs a CCR client API key (created in the UI); the provider key above is verified directly.",
        );
    } else {
        printInfo(`CCR gateway is not reachable on ${CCR_GATEWAY_URL} yet.`);
    }
    void ctx;
};

const statusResult = (
    ctx: HarnessContext,
    state: CcrContextState | null,
    extra: Partial<HarnessResult>,
): HarnessResult => ({
    harness: ID,
    label: LABEL,
    configured: false,
    model: state?.model,
    state: state?.state,
    files: [contextPath(ctx), ccrConfigDb(ctx)],
    ...extra,
});
