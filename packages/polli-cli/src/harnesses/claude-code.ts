import { existsSync } from "node:fs";
import { join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import {
    captureFiles,
    commandExists,
    readTextIfExists,
    removeIfExists,
    resolveHomePath,
    restoreCapturedFiles,
    writeTextAtomic,
} from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "claude-code";
const LABEL = "Claude Code";
const PROVIDER = "pollinations";
const PROFILE_ID = "pollinations";
const PROFILE_NAME = "Pollinations";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const INSTALL_HINT =
    "Claude Code Router is required. Install it with `npm install -g @musistudio/claude-code-router`," +
    " start it once with `ccr start`, then run this command again.";
const NOT_RUNNING_HINT =
    "Claude Code Router is not running. Start it with `ccr start` and run this command again:" +
    " polli talks to the router's own management API, which is the only supported way to change its config.";

/** The slice of the router's config document this adapter owns. */
export interface CcrProvider {
    id?: string;
    name?: string;
    api_base_url?: string;
    api_key?: string;
    models?: string[];
    [key: string]: unknown;
}

export interface CcrProfile {
    id?: string;
    name?: string;
    agent?: string;
    scope?: string;
    enabled?: boolean;
    model?: string;
    settingsFile?: string;
    env?: Record<string, string>;
    [key: string]: unknown;
}

export interface CcrConfig {
    Providers?: CcrProvider[];
    preferredProvider?: string;
    profile?: {
        profiles?: CcrProfile[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface CcrService {
    origin: string;
    token: string;
}

export interface ClaudeCodeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

export interface ClaudeCodeDependencies {
    fetchImpl?: typeof fetch;
    /**
     * Writes the client's settings document the way the router does, so the
     * tests never need a running router. The real adapter never calls this: the
     * router applies the profile itself.
     */
    applySettings?: (ctx: HarnessContext, settings: ClaudeCodeSettings) => void;
}

const firstConfigured = (...values: (string | undefined)[]) =>
    values.map((value) => value?.trim()).find((value) => value);

/**
 * Mirror `resolveRuntimeConfigDir` from the router's `runtime/app-paths.mjs`:
 * Windows keeps the directory under the app-data root, every other platform
 * under the home directory, and `CCR_INTERNAL_*` overrides either. Reading
 * `service.json` from the wrong directory is the difference between "the router
 * is not running" and a working configuration.
 */
const ccrDir = (ctx: HarnessContext) => {
    if (process.platform === "win32") {
        const appData =
            firstConfigured(
                ctx.env.CCR_INTERNAL_APP_DATA_DIR,
                ctx.env.APPDATA,
                ctx.env.LOCALAPPDATA,
                ctx.env.USERPROFILE
                    ? join(ctx.env.USERPROFILE, "AppData", "Roaming")
                    : undefined,
            ) ?? join(ctx.home, "AppData", "Roaming");
        return join(resolveHomePath(ctx.home, appData), "claude-code-router");
    }
    const home = firstConfigured(ctx.env.CCR_INTERNAL_HOME_DIR) ?? ctx.home;
    return join(resolveHomePath(ctx.home, home), ".claude-code-router");
};

const serviceFile = (ctx: HarnessContext) => join(ccrDir(ctx), "service.json");

export const claudeSettingsPath = (ctx: HarnessContext) => {
    const configured = ctx.env.CLAUDE_CONFIG_DIR?.trim();
    return join(
        configured
            ? resolveHomePath(ctx.home, configured)
            : join(ctx.home, ".claude"),
        "settings.json",
    );
};

const markerPath = (ctx: HarnessContext) =>
    join(ctx.home, ".pollinations", "harnesses", `${ID}.json`);

/**
 * The client document the router's profile application touches, plus polli's
 * marker. Everything else about this integration lives in the router's own
 * config store, which polli only ever changes through its management API.
 */
export const claudeCodeFiles = (ctx: HarnessContext) => [
    claudeSettingsPath(ctx),
    markerPath(ctx),
];

const alive = (pid: number) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

/**
 * The router publishes where its management server listens, and the token it
 * expects, in `service.json` next to its config. Reading that is what lets
 * polli use the same authenticated API the router's own UI uses instead of
 * writing the router's SQLite config behind its back.
 */
export const readService = (ctx: HarnessContext): CcrService | null => {
    const text = readTextIfExists(serviceFile(ctx));
    if (!text) return null;
    try {
        const state = JSON.parse(text) as { pid?: number; url?: string };
        if (!state.pid || !alive(state.pid) || !state.url) return null;
        const url = new URL(state.url);
        return {
            origin: url.origin,
            token: url.searchParams.get("ccr_web_token") ?? "",
        };
    } catch {
        return null;
    }
};

export const ccrInstalled = (ctx: HarnessContext) =>
    commandExists("ccr", ctx.env) ||
    existsSync(join(ccrDir(ctx), "config.sqlite"));

const requireService = (ctx: HarnessContext): CcrService => {
    if (!ccrInstalled(ctx)) throw new Error(INSTALL_HINT);
    const service = readService(ctx);
    if (!service) throw new Error(NOT_RUNNING_HINT);
    return service;
};

interface RpcResponse<T> {
    ok?: boolean;
    value?: T;
    error?: { message?: string };
}

export const callRpc = async <T>(
    service: CcrService,
    method: string,
    args: unknown[],
    fetchImpl: typeof fetch = fetch,
): Promise<T> => {
    const response = await fetchImpl(`${service.origin}/api/ccr/rpc`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-ccr-web-auth": service.token,
        },
        body: JSON.stringify({ method, args }),
    });
    if (!response.ok) {
        throw new Error(
            `Claude Code Router rejected the management request (HTTP ${response.status}).` +
                " Set CCR_WEB_AUTH_TOKEN when you start the router, or start it again with `ccr start`.",
        );
    }
    const body = (await response.json()) as RpcResponse<T>;
    if (body.ok === false) {
        throw new Error(
            `Claude Code Router refused ${method}: ${body.error?.message ?? "unknown error"}`,
        );
    }
    return body.value as T;
};

export const readConfig = (
    service: CcrService,
    dependencies: ClaudeCodeDependencies = {},
) => callRpc<CcrConfig>(service, "getConfig", [], dependencies.fetchImpl);

const saveConfig = (
    service: CcrService,
    config: CcrConfig,
    dependencies: ClaudeCodeDependencies = {},
    options?: { applyProfile?: boolean },
) =>
    callRpc<CcrConfig>(
        service,
        "saveConfig",
        options ? [config, options] : [config],
        dependencies.fetchImpl,
    );

const sameName = (value: string | undefined, expected: string) =>
    (value ?? "").trim().toLowerCase() === expected;

const findProvider = (config: CcrConfig) =>
    (config.Providers ?? []).find(
        (provider) =>
            sameName(provider.id, PROVIDER) ||
            sameName(provider.name, PROVIDER),
    );

const findProfile = (config: CcrConfig) =>
    (config.profile?.profiles ?? []).find(
        (profile) =>
            sameName(profile.id, PROFILE_ID) ||
            sameName(profile.name, PROFILE_NAME),
    );

/**
 * Add or refresh the provider and the isolated Claude Code profile. Every other
 * provider, profile, and router setting is carried through untouched: the
 * profile scope is `ccr`, so nothing applies to the user's own Claude Code
 * session until they launch it through this profile.
 */
export const mergePollinations = (
    config: CcrConfig,
    settings: ClaudeCodeSettings,
): CcrConfig => {
    const provider: CcrProvider = {
        ...(findProvider(config) ?? {}),
        id: PROVIDER,
        name: PROVIDER,
        api_base_url: `${BASE_URL}/v1`,
        api_key: settings.apiKey,
        models: settings.models.map((model) => model.id),
    };
    const providers = [
        ...(config.Providers ?? []).filter(
            (entry) =>
                !sameName(entry.id, PROVIDER) &&
                !sameName(entry.name, PROVIDER),
        ),
        provider,
    ];
    const profile: CcrProfile = {
        ...(findProfile(config) ?? {}),
        id: PROFILE_ID,
        name: PROFILE_NAME,
        agent: "claude-code",
        enabled: true,
        scope: "ccr",
        model: `${PROVIDER},${settings.model}`,
        settingsFile:
            findProfile(config)?.settingsFile ?? "~/.claude/settings.json",
    };
    const profiles = [
        ...(config.profile?.profiles ?? []).filter(
            (entry) =>
                !sameName(entry.id, PROFILE_ID) &&
                !sameName(entry.name, PROFILE_NAME),
        ),
        profile,
    ];
    return {
        ...config,
        Providers: providers,
        profile: { ...(config.profile ?? {}), profiles },
    };
};

/** Remove only what this adapter added. */
export const stripPollinations = (config: CcrConfig) => {
    const providers = (config.Providers ?? []).filter(
        (entry) =>
            !sameName(entry.id, PROVIDER) && !sameName(entry.name, PROVIDER),
    );
    const profiles = (config.profile?.profiles ?? []).filter(
        (entry) =>
            !sameName(entry.id, PROFILE_ID) &&
            !sameName(entry.name, PROFILE_NAME),
    );
    const changed =
        providers.length !== (config.Providers ?? []).length ||
        profiles.length !== (config.profile?.profiles ?? []).length;
    return {
        changed,
        config: {
            ...config,
            Providers: providers,
            profile: { ...(config.profile ?? {}), profiles },
        } as CcrConfig,
    };
};

const writeMarker = (ctx: HarnessContext, model: string) =>
    writeTextAtomic(
        markerPath(ctx),
        `${JSON.stringify({ model, providerId: PROVIDER, profileId: PROFILE_ID }, null, 2)}\n`,
        0o600,
    );

const readMarkerModel = (ctx: HarnessContext) => {
    const text = readTextIfExists(markerPath(ctx));
    if (!text) return undefined;
    try {
        return (JSON.parse(text) as { model?: string }).model;
    } catch {
        return undefined;
    }
};

/**
 * Connect Claude Code to Pollinations through Claude Code Router's own
 * management API, which applies the agent profile for us.
 */
export const configureClaudeCode = async (
    ctx: HarnessContext,
    settings: ClaudeCodeSettings,
    dependencies: ClaudeCodeDependencies = {},
): Promise<HarnessResult> => {
    const service = requireService(ctx);
    const files = claudeCodeFiles(ctx);
    const before = await readConfig(service, dependencies);
    const next = mergePollinations(before, settings);
    // The files are read before the router is asked to change anything: the
    // snapshot can only tell an untouched client document from an edited one,
    // so a failure that already rewrote it needs its own way back.
    const captured = captureFiles(files);
    applyWithSnapshot(ctx, ID, files, () => {});
    try {
        await saveConfig(service, next, dependencies);
        dependencies.applySettings?.(ctx, settings);
    } catch (error) {
        // The router may have rewritten the client document before failing, so
        // put ours back explicitly rather than trusting the drift check.
        try {
            await saveConfig(service, before, dependencies);
        } catch {}
        restoreCapturedFiles(captured);
        restoreOrStrip(ctx, ID, files, () => false);
        throw error;
    }
    // The marker is part of the file set, so it has to exist before the second
    // snapshot records what this run left behind — otherwise `off` reads its
    // own marker as the user's drift.
    writeMarker(ctx, settings.model);
    applyWithSnapshot(ctx, ID, files, () => {});
    return claudeCodeStatus(ctx, dependencies);
};

export const disableClaudeCode = async (
    ctx: HarnessContext,
    dependencies: ClaudeCodeDependencies = {},
): Promise<HarnessResult> => {
    const service = requireService(ctx);
    const current = await readConfig(service, dependencies);
    const { changed, config } = stripPollinations(current);
    // Save without re-applying the profile: the client's document is restored
    // from our snapshot below, so the router must not rewrite it first.
    if (changed) {
        await saveConfig(service, config, dependencies, {
            applyProfile: false,
        });
    }
    const outcome = restoreOrStrip(
        ctx,
        ID,
        claudeCodeFiles(ctx),
        () => changed,
    );
    removeIfExists(markerPath(ctx));
    return {
        ...(await claudeCodeStatus(ctx, dependencies)),
        configured: false,
        outcome,
    };
};

export const claudeCodeStatus = async (
    ctx: HarnessContext,
    dependencies: ClaudeCodeDependencies = {},
): Promise<HarnessResult> => {
    const files = claudeCodeFiles(ctx);
    const service = readService(ctx);
    if (!service) {
        return {
            harness: ID,
            label: LABEL,
            configured: false,
            model: readMarkerModel(ctx),
            files,
        };
    }
    try {
        const config = await readConfig(service, dependencies);
        return {
            harness: ID,
            label: LABEL,
            configured: Boolean(findProvider(config) && findProfile(config)),
            model:
                findProfile(config)?.model?.split(",").at(-1) ??
                readMarkerModel(ctx),
            files,
        };
    } catch {
        return {
            harness: ID,
            label: LABEL,
            configured: false,
            model: readMarkerModel(ctx),
            files,
        };
    }
};

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Configure Claude Code as a Pollinations client through Claude Code Router",
    restartHint:
        "Launch Claude Code through the profile: `ccr Pollinations` (or pick it in the router's Agent Config screen), then choose a pollinations model.",

    async on(ctx, options) {
        const service = requireService(ctx);
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        // Reuse the key already stored in the router's provider entry when it is
        // still valid; otherwise mint a dedicated child key for this harness.
        const current = await readConfig(service);
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: findProvider(current)?.api_key ?? null,
            },
            { browser: options.browser },
        );
        return configureClaudeCode(ctx, { apiKey, model, models });
    },

    off: disableClaudeCode,
    status: claudeCodeStatus,
};
