import { createHash } from "node:crypto";
import { join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    resolveHomePath,
    writeTextAtomic,
} from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
    OffOutcome,
} from "./types.js";

const ID = "claude-code";
const LABEL = "Claude Code";
const PROVIDER_ID = "pollinations";
const PROVIDER_NAME = "Pollinations";
/** Chat Completions protocol; CCR normalizes `"openai"` to Responses instead. */
const PROVIDER_PROTOCOL = "openai_chat_completions";
const PROFILE_ID = "pollinations-claude-code";
const PROFILE_NAME = "Pollinations";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
/** Marker stored in the provider's free-form `billing` field; `off` only removes providers carrying it. */
const OWNERSHIP_MARKER = "polli harness claude-code";
const RPC_PATH = "/api/ccr/rpc";
const RPC_TIMEOUT_MS = 5_000;

const envValue = (ctx: HarnessContext, name: string): string | undefined => {
    const value = ctx.env[name]?.trim();
    return value ? value : undefined;
};

/**
 * Claude Code Router config root. CCR resolves it as `<home>/.claude-code-router`
 * (`APP_STORAGE_NAME`); `CCR_INTERNAL_HOME_DIR` overrides the home it joins.
 */
export const configDir = (ctx: HarnessContext): string => {
    const home =
        envValue(ctx, "CCR_INTERNAL_HOME_DIR") ??
        envValue(ctx, "CLAUDE_CODE_ROUTER_HOME") ??
        "~";
    return join(resolveHomePath(ctx.home, home), ".claude-code-router");
};

export interface ClaudeCodeStatePaths {
    service: string;
    key: string;
}

/** Files the integration owns. Nothing here overlaps the user's `~/.claude`. */
export const statePaths = (ctx: HarnessContext): ClaudeCodeStatePaths => {
    const dir = configDir(ctx);
    return {
        service: join(dir, "service.json"),
        key: join(dir, `${PROVIDER_ID}.key`),
    };
};

/** CCR management service address + auth token, read from its own service.json. */
export interface CcrService {
    url: string;
    token: string;
}

export const readServiceState = (ctx: HarnessContext): CcrService | null => {
    const text = readTextIfExists(statePaths(ctx).service);
    if (!text?.trim()) return null;
    let parsed: { url?: unknown };
    try {
        parsed = JSON.parse(text) as { url?: unknown };
    } catch {
        return null;
    }
    if (typeof parsed.url !== "string") return null;
    let url: URL;
    try {
        url = new URL(parsed.url);
    } catch {
        return null;
    }
    const token =
        url.searchParams.get("ccr_web_token")?.trim() ??
        envValue(ctx, "CCR_WEB_AUTH_TOKEN") ??
        "";
    if (!token) return null;
    return { url: `${url.origin}${RPC_PATH}`, token };
};

export interface RpcCall {
    url: string;
    token: string;
    method: string;
    args: unknown[];
}

export interface RpcResult {
    status: number | null;
    value?: unknown;
    error?: string;
}

/** Runs one CCR management RPC; injectable so tests never open a socket. */
export type CcrRpcRunner = (call: RpcCall) => Promise<RpcResult> | RpcResult;

const defaultRpcRunner: CcrRpcRunner = async ({ url, token, method, args }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-ccr-web-auth": token,
            },
            body: JSON.stringify({ method, args }),
            signal: controller.signal,
        });
        const payload = (await response.json().catch(() => undefined)) as
            | { ok?: boolean; value?: unknown; error?: { message?: string } }
            | undefined;
        if (!response.ok || !payload?.ok) {
            return {
                status: response.status,
                error:
                    payload?.error?.message ??
                    `CCR RPC ${method} failed with HTTP ${response.status}`,
            };
        }
        return { status: response.status, value: payload.value };
    } catch (error) {
        return {
            status: null,
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
        clearTimeout(timer);
    }
};

const call = async (
    service: CcrService,
    runner: CcrRpcRunner,
    method: string,
    args: unknown[] = [],
): Promise<unknown> => {
    const result = await runner({
        url: service.url,
        token: service.token,
        method,
        args,
    });
    if (result.status !== 200 || result.error) {
        throw new Error(
            `CCR RPC ${method} failed${result.error ? `: ${result.error}` : ""}`,
        );
    }
    return result.value;
};

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const readKey = (ctx: HarnessContext): string | null => {
    const key = readTextIfExists(statePaths(ctx).key)?.trim();
    return key ? key : null;
};

const providerList = (config: JsonObject): JsonObject[] =>
    Array.isArray(config.Providers) ? (config.Providers as JsonObject[]) : [];

const profileList = (config: JsonObject): JsonObject[] => {
    const profile = config.profile;
    return isObject(profile) && Array.isArray(profile.profiles)
        ? (profile.profiles as JsonObject[])
        : [];
};

const isOwnedProvider = (provider: unknown): boolean =>
    isObject(provider) &&
    provider.id === PROVIDER_ID &&
    typeof provider.billing === "string" &&
    provider.billing.includes(OWNERSHIP_MARKER);

const isOwnedProfile = (profile: unknown): boolean =>
    isObject(profile) &&
    profile.id === PROFILE_ID &&
    profile.agent === "claude-code";

const findProvider = (config: JsonObject): JsonObject | null =>
    providerList(config).find((provider) => provider.id === PROVIDER_ID) ??
    null;

const snapshotPath = (ctx: HarnessContext): string =>
    join(ctx.home, ".pollinations", "harnesses", `${ID}.ccr.json`);

const sha256 = (content: string): string =>
    createHash("sha256").update(content).digest("hex");

interface CcrSnapshot {
    before: string;
    afterHash: string | null;
}

const writeSnapshot = (
    ctx: HarnessContext,
    snapshot: { before: string; afterHash: string | null },
) =>
    writeTextAtomic(
        snapshotPath(ctx),
        JSON.stringify(snapshot, null, 2),
        0o600,
    );

const loadSnapshot = (ctx: HarnessContext): CcrSnapshot | null => {
    const text = readTextIfExists(snapshotPath(ctx));
    if (!text) return null;
    try {
        return JSON.parse(text) as CcrSnapshot;
    } catch {
        return null;
    }
};

/** The provider we manage, marked so `off` never removes a foreign one. */
const providerEntry = (apiKey: string, models: HarnessModel[]): JsonObject => ({
    id: PROVIDER_ID,
    name: PROVIDER_NAME,
    type: PROVIDER_PROTOCOL,
    api_base_url: `${BASE_URL}/v1`,
    api_key: apiKey,
    models: models.map((model) => model.id),
    enabled: true,
    billing: `${OWNERSHIP_MARKER} (managed by polli; run \`polli harness ${ID} off\` to disconnect)`,
});

/**
 * Isolated profile for Claude Code. Scope `"ccr"` keeps it out of the global
 * profiles that would rewrite the user's native `~/.claude`.
 */
const profileEntry = (model: string): JsonObject => ({
    agent: "claude-code",
    enabled: true,
    fableModel: "",
    haikuModel: "",
    id: PROFILE_ID,
    managedCompact: false,
    model,
    name: PROFILE_NAME,
    opusModel: "",
    scope: "ccr",
    settingsFile: "~/.claude/settings.json",
    smallFastModel: "",
    sonnetModel: "",
    surface: "auto",
});

const upsertProvider = (
    config: JsonObject,
    apiKey: string,
    models: HarnessModel[],
) => {
    const existing = findProvider(config);
    if (existing && !isOwnedProvider(existing)) {
        throw new Error(
            `Claude Code Router already has a provider "${PROVIDER_ID}" that polli does not own. ` +
                `Rename or remove it first, then retry \`polli harness ${ID} on\`.`,
        );
    }
    const entry = providerEntry(apiKey, models);
    config.Providers = existing
        ? providerList(config).map((provider) =>
              provider.id === PROVIDER_ID
                  ? { ...provider, ...entry }
                  : provider,
          )
        : [...providerList(config), entry];
};

const upsertProfile = (config: JsonObject, model: string) => {
    const entry = profileEntry(model);
    const profiles = profileList(config);
    const next = profiles.some((profile) => profile.id === PROFILE_ID)
        ? profiles.map((profile) =>
              profile.id === PROFILE_ID ? { ...profile, ...entry } : profile,
          )
        : [...profiles, entry];
    config.profile = isObject(config.profile)
        ? { ...config.profile, profiles: next }
        : { profiles: next };
};

/** Remove only our provider and profile, leaving user edits intact. */
const stripArtifacts = (config: JsonObject): boolean => {
    const providers = providerList(config);
    const keptProviders = providers.filter(
        (provider) => !isOwnedProvider(provider),
    );
    const profiles = profileList(config);
    const keptProfiles = profiles.filter((profile) => !isOwnedProfile(profile));
    let changed = false;
    if (keptProviders.length !== providers.length) {
        config.Providers = keptProviders;
        changed = true;
    }
    if (keptProfiles.length !== profiles.length && isObject(config.profile)) {
        config.profile = { ...config.profile, profiles: keptProfiles };
        changed = true;
    }
    return changed;
};

export interface ClaudeCodeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
    service: CcrService;
}

const persist = (
    settings: ClaudeCodeSettings,
    runner: CcrRpcRunner,
    config: JsonObject,
) =>
    call(settings.service, runner, "saveConfig", [
        config,
        { applyProfile: true },
    ]);

/**
 * Wire Claude Code Router to Pollinations: one owned provider plus an isolated
 * `ccr`-scoped profile, so the native `~/.claude` config is never touched. A
 * failed step restores the pre-`on` config.
 */
export const configureClaudeCode = async (
    ctx: HarnessContext,
    settings: ClaudeCodeSettings,
    runner: CcrRpcRunner = defaultRpcRunner,
): Promise<HarnessResult> => {
    const apiKey = settings.apiKey.trim();
    if (!apiKey) {
        throw new Error(
            "No Pollinations API key is available for Claude Code.",
        );
    }
    if (settings.models.length === 0) {
        throw new Error(
            "No tool-calling Pollinations models are available for Claude Code.",
        );
    }

    const beforeValue = await call(settings.service, runner, "getConfig");
    if (!isObject(beforeValue)) {
        throw new Error("Claude Code Router returned an unreadable config.");
    }
    const before = JSON.stringify(beforeValue);
    const previous = loadSnapshot(ctx);
    const snapshot: { before: string; afterHash: string | null } = previous ?? {
        before,
        afterHash: null,
    };
    if (!previous) writeSnapshot(ctx, snapshot);

    const config: JsonObject = JSON.parse(before) as JsonObject;
    try {
        upsertProvider(config, apiKey, settings.models);
        upsertProfile(config, settings.model);
        await persist(settings, runner, config);
        writeTextAtomic(statePaths(ctx).key, `${apiKey}\n`, 0o600);
    } catch (error) {
        try {
            await persist(
                settings,
                runner,
                JSON.parse(previous ? before : snapshot.before) as JsonObject,
            );
            if (!previous) {
                removeIfExists(snapshotPath(ctx));
                removeIfExists(statePaths(ctx).key);
            }
        } catch (rollbackError) {
            throw new AggregateError(
                [error, rollbackError],
                "Claude Code setup failed and its config could not be restored",
            );
        }
        throw error;
    }

    const afterValue = await call(settings.service, runner, "getConfig");
    snapshot.afterHash = sha256(JSON.stringify(afterValue ?? config));
    writeSnapshot(ctx, snapshot);
    return readStatus(ctx);
};

/** Restore the pre-`on` config, or strip only our entries, then drop the key. */
export const disableClaudeCode = async (
    ctx: HarnessContext,
    runner: CcrRpcRunner = defaultRpcRunner,
): Promise<HarnessResult> => {
    const service = readServiceState(ctx);
    const snapshot = loadSnapshot(ctx);
    if (!service) {
        removeIfExists(snapshotPath(ctx));
        removeIfExists(statePaths(ctx).key);
        return { ...readStatus(ctx), configured: false, outcome: "unchanged" };
    }

    const currentValue = await call(service, runner, "getConfig");
    const current = isObject(currentValue) ? currentValue : {};
    let outcome: OffOutcome;

    const untouched =
        snapshot !== null &&
        snapshot.afterHash !== null &&
        sha256(JSON.stringify(current)) === snapshot.afterHash;

    if (untouched) {
        await persist(
            { apiKey: "", model: "", models: [], service },
            runner,
            JSON.parse(snapshot.before) as JsonObject,
        );
        outcome = "restored";
    } else {
        const changed = stripArtifacts(current);
        if (changed) {
            await persist(
                { apiKey: "", model: "", models: [], service },
                runner,
                current,
            );
        }
        outcome = changed ? "stripped" : "unchanged";
    }

    removeIfExists(snapshotPath(ctx));
    removeIfExists(statePaths(ctx).key);
    return { ...readStatus(ctx), configured: false, outcome };
};

/** Managed CLI names CCR ships; first match from PATH wins. */
export const resolveCcrCli = (ctx: HarnessContext): string | null => {
    for (const name of ["ccr", "claude-code-router"]) {
        if (commandExists(name, ctx.env)) return name;
    }
    return null;
};

export const readStatus = (ctx: HarnessContext): HarnessResult => {
    const service = readServiceState(ctx);
    const hasKey = readKey(ctx) !== null;
    return {
        harness: ID,
        label: LABEL,
        configured: Boolean(service && hasKey),
        model: hasKey ? DEFAULT_MODEL : undefined,
        files: Object.values(statePaths(ctx)),
    };
};

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Connect Claude Code to Pollinations through Claude Code Router",
    restartHint:
        'Launch the Pollinations profile with: ccr "Pollinations". Your native Claude Code login and settings are left untouched.',

    async on(ctx, options) {
        if (!resolveCcrCli(ctx)) {
            throw new Error(
                "Claude Code Router was not found. Install it first — see " +
                    "https://github.com/musistudio/claude-code-router, then start it with `ccr start`.",
            );
        }
        const service = readServiceState(ctx);
        if (!service) {
            throw new Error(
                "Claude Code Router's management service is not running. " +
                    "Start it with `ccr start` and retry.",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureClaudeCode(ctx, { apiKey, model, models, service });
    },

    off: (ctx) => disableClaudeCode(ctx),
    status: readStatus,
};
