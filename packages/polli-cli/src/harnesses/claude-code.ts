import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
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
import {
    requireCompatibleVersion,
    requireSuccessfulCommand,
} from "./process.js";
import { responseError, verifyHarnessSmoke } from "./smoke.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
    OffOutcome,
} from "./types.js";

const ID = "claude-code";
const LABEL = "Claude Code Router";
const PROVIDER_ID = "pollinations";
const PROVIDER_NAME = "Pollinations.ai";
const PROFILE_ID = "pollinations-claude-code";
const PROFILE_NAME = "Pollinations Claude Code";
const PROFILE_KEY_ID = `profile:${PROFILE_ID}`;
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const MIN_VERSION = "3.1.1";
const NEXT_MAJOR = "4.0.0";

type JsonRecord = Record<string, unknown>;

interface OwnershipJournal {
    version: 1;
    providerHash: string;
    profileHash: string;
    profileEnabledBefore: boolean;
    profileEnabledAfter: boolean;
}

interface ConfigUpdate {
    config: JsonRecord;
    provider: JsonRecord;
    profile: JsonRecord;
}

interface ServiceConnection {
    endpoint: string;
    token: string;
}

const asRecord = (value: unknown): JsonRecord | null =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as JsonRecord)
        : null;

const asRecords = (value: unknown): JsonRecord[] =>
    Array.isArray(value)
        ? value.filter((entry): entry is JsonRecord => asRecord(entry) !== null)
        : [];

const hash = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");

const configDir = (ctx: HarnessContext) => {
    if (process.platform === "win32") {
        const appData =
            ctx.env.CCR_INTERNAL_APP_DATA_DIR?.trim() ||
            ctx.env.APPDATA?.trim() ||
            ctx.env.LOCALAPPDATA?.trim() ||
            join(ctx.home, "AppData", "Roaming");
        return join(appData, "claude-code-router");
    }
    const home = ctx.env.CCR_INTERNAL_HOME_DIR?.trim() || ctx.home;
    return join(home, ".claude-code-router");
};

const serviceFile = (ctx: HarnessContext) => join(configDir(ctx), "service.json");
const journalFile = (ctx: HarnessContext) =>
    join(ctx.home, ".pollinations", "harnesses", "claude-code-router.json");

const loadJournal = (ctx: HarnessContext): OwnershipJournal | null => {
    const text = readTextIfExists(journalFile(ctx));
    if (!text) return null;
    try {
        const value = JSON.parse(text) as Partial<OwnershipJournal>;
        return value.version === 1 &&
            typeof value.providerHash === "string" &&
            typeof value.profileHash === "string" &&
            typeof value.profileEnabledBefore === "boolean" &&
            typeof value.profileEnabledAfter === "boolean"
            ? (value as OwnershipJournal)
            : null;
    } catch {
        return null;
    }
};

const saveJournal = (
    ctx: HarnessContext,
    update: ConfigUpdate,
    profileEnabledBefore: boolean,
) =>
    writeTextAtomic(
        journalFile(ctx),
        `${JSON.stringify(
            {
                version: 1,
                providerHash: hash(update.provider),
                profileHash: hash(update.profile),
                profileEnabledBefore,
                profileEnabledAfter:
                    profileConfigFrom(update.config).enabled !== false,
            } satisfies OwnershipJournal,
            null,
            2,
        )}\n`,
        0o600,
    );

const providerFrom = (config: JsonRecord) =>
    asRecords(config.Providers).find((entry) => entry.id === PROVIDER_ID);

const profileFrom = (config: JsonRecord) => {
    const profileConfig = asRecord(config.profile);
    return asRecords(profileConfig?.profiles).find(
        (entry) => entry.id === PROFILE_ID,
    );
};

const profileConfigFrom = (config: JsonRecord) => {
    const value = asRecord(config.profile);
    if (!value) throw new Error("CCR returned an invalid profile configuration.");
    return value;
};

const providerLooksOurs = (provider: JsonRecord | undefined) =>
    provider?.id === PROVIDER_ID &&
    provider.provider === PROVIDER_ID &&
    provider.name === PROVIDER_NAME &&
    provider.type === "openai_chat_completions" &&
    provider.api_base_url === `${BASE_URL}/v1`;

const profileLooksOurs = (profile: JsonRecord | undefined) =>
    profile?.id === PROFILE_ID &&
    profile.name === PROFILE_NAME &&
    profile.agent === "claude-code" &&
    profile.scope === "ccr";

const entriesMatchJournal = (
    provider: JsonRecord | undefined,
    profile: JsonRecord | undefined,
    journal: OwnershipJournal | null,
) =>
    Boolean(
        provider &&
            profile &&
            journal &&
            hash(provider) === journal.providerHash &&
            hash(profile) === journal.profileHash,
    );

const configurationMatchesJournal = (
    config: JsonRecord,
    journal: OwnershipJournal | null,
) =>
    Boolean(
        journal &&
            entriesMatchJournal(
                providerFrom(config),
                profileFrom(config),
                journal,
            ) &&
            (profileConfigFrom(config).enabled !== false) ===
                journal.profileEnabledAfter,
    );

const assertNoCollisions = (
    config: JsonRecord,
    journal: OwnershipJournal | null,
) => {
    const provider = providerFrom(config);
    const profile = profileFrom(config);
    if (!provider && !profile) return;
    if (configurationMatchesJournal(config, journal)) return;
    if (provider) {
        throw new Error(
            `CCR already has a user-owned or edited provider with id ${PROVIDER_ID}; rename it or run polli harness claude-code off first.`,
        );
    }
    throw new Error(
        `CCR already has a user-owned or edited profile with id ${PROFILE_ID}; rename it or run polli harness claude-code off first.`,
    );
};

const providerEntry = (
    models: HarnessModel[],
    apiKey: string,
): JsonRecord => ({
    id: PROVIDER_ID,
    provider: PROVIDER_ID,
    name: PROVIDER_NAME,
    type: "openai_chat_completions",
    api_base_url: `${BASE_URL}/v1`,
    api_key: apiKey,
    enabled: true,
    models: models.map((model) => model.id),
    modelMetadata: Object.fromEntries(
        models.map((model) => [
            model.id,
            {
                contextWindow: model.contextWindow,
                contextWindowPinned: true,
                capabilities: { imageInput: model.input.includes("image") },
            },
        ]),
    ),
});

const profileEntry = (models: HarnessModel[], model: string): JsonRecord => ({
    id: PROFILE_ID,
    name: PROFILE_NAME,
    agent: "claude-code",
    enabled: true,
    env: {},
    model: `${PROVIDER_NAME}/${model}`,
    availableModels: models.map((entry) => `${PROVIDER_NAME}/${entry.id}`),
    fableModel: "",
    haikuModel: "",
    managedCompact: false,
    opusModel: "",
    settingsFile: "~/.claude/settings.json",
    sonnetModel: "",
    smallFastModel: "",
    scope: "ccr",
    surface: "cli",
});

export const configureClaudeCodeConfig = (
    current: JsonRecord,
    models: HarnessModel[],
    apiKey: string,
    model: string,
    journal: OwnershipJournal | null = null,
): ConfigUpdate => {
    assertNoCollisions(current, journal);
    const config = structuredClone(current);
    const provider = providerEntry(models, apiKey);
    const profile = profileEntry(models, model);
    config.Providers = [
        ...asRecords(config.Providers).filter(
            (entry) => entry.id !== PROVIDER_ID,
        ),
        provider,
    ];
    const profileConfig = profileConfigFrom(config);
    profileConfig.enabled = true;
    profileConfig.profiles = [
        ...asRecords(profileConfig.profiles).filter(
            (entry) => entry.id !== PROFILE_ID,
        ),
        profile,
    ];
    return { config, provider, profile };
};

export const stripClaudeCodeConfig = (
    current: JsonRecord,
    journal: OwnershipJournal | null,
) => {
    if (!journal) return { config: current, changed: false };
    const config = structuredClone(current);
    const providers = asRecords(config.Providers);
    const profiles = asRecords(profileConfigFrom(config).profiles);
    const provider = providers.find((entry) => entry.id === PROVIDER_ID);
    const profile = profiles.find((entry) => entry.id === PROFILE_ID);
    const exact = configurationMatchesJournal(config, journal);
    config.Providers = providers.filter((entry) => entry.id !== PROVIDER_ID);
    const profileConfig = profileConfigFrom(config);
    profileConfig.profiles = profiles.filter(
        (entry) => entry.id !== PROFILE_ID,
    );
    if (exact) profileConfig.enabled = journal.profileEnabledBefore;
    return {
        config,
        changed: Boolean(provider || profile),
        outcome: (provider || profile
            ? exact
                ? "restored"
                : "stripped"
            : "unchanged") as OffOutcome,
    };
};

const serviceConnection = (ctx: HarnessContext): ServiceConnection => {
    const text = readTextIfExists(serviceFile(ctx));
    if (!text) {
        throw new Error("CCR service is not running; run: ccr start --no-open");
    }
    let url: URL;
    try {
        const state = JSON.parse(text) as { url?: unknown };
        if (typeof state.url !== "string") throw new Error("missing url");
        url = new URL(state.url);
    } catch {
        throw new Error("CCR service.json is invalid; restart with: ccr start --no-open");
    }
    const token = url.searchParams.get("ccr_web_token")?.trim();
    if (!token) {
        throw new Error("CCR management token is missing; restart with: ccr start --no-open");
    }
    return {
        endpoint: new URL("/api/ccr/rpc", url).toString(),
        token,
    };
};

const rpc = async <T>(
    ctx: HarnessContext,
    method: string,
    args: unknown[] = [],
): Promise<T> => {
    const connection = serviceConnection(ctx);
    const response = await fetch(connection.endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-ccr-web-auth": connection.token,
        },
        body: JSON.stringify({ method, args }),
        signal: AbortSignal.timeout(30_000),
    });
    const payload = (await response.json().catch(() => null)) as
        | { ok: true; value: T }
        | { ok: false; error?: { message?: string } }
        | null;
    if (!response.ok || !payload?.ok) {
        const message =
            payload && !payload.ok ? payload.error?.message : undefined;
        throw new Error(
            message || `CCR management RPC ${method} failed with HTTP ${response.status}.`,
        );
    }
    return payload.value;
};

const ensureService = (ctx: HarnessContext) => {
    requireSuccessfulCommand("ccr", ["start", "--no-open"], ctx, 35_000);
    serviceConnection(ctx);
};

const readVersion = async (ctx: HarnessContext) => {
    const info = await rpc<{ version?: unknown }>(ctx, "getAppInfo");
    return requireCompatibleVersion(
        LABEL,
        typeof info.version === "string" ? info.version : "",
        MIN_VERSION,
        NEXT_MAJOR,
    );
};

const configuredModel = (profile: JsonRecord | undefined) => {
    const model = typeof profile?.model === "string" ? profile.model : "";
    const prefix = `${PROVIDER_NAME}/`;
    return model.startsWith(prefix) ? model.slice(prefix.length) : undefined;
};

const providerKey = (
    config: JsonRecord,
    journal: OwnershipJournal | null,
) => {
    const provider = providerFrom(config);
    const profile = profileFrom(config);
    if (!configurationMatchesJournal(config, journal)) return null;
    const key = typeof provider?.api_key === "string" ? provider.api_key : "";
    return key.trim() || null;
};

const clientKey = (config: JsonRecord) => {
    const entry = asRecords(config.APIKEYS).find(
        (candidate) => candidate.id === PROFILE_KEY_ID,
    );
    const key = typeof entry?.key === "string" ? entry.key.trim() : "";
    if (!key) throw new Error("CCR did not create the isolated profile client key.");
    return key;
};

const gatewayEndpoint = (config: JsonRecord, status: JsonRecord) => {
    const endpoint =
        (typeof status.endpoint === "string" && status.endpoint.trim()) ||
        (typeof config.routerEndpoint === "string" &&
            config.routerEndpoint.trim());
    if (!endpoint) throw new Error("CCR did not report a gateway endpoint.");
    return endpoint.replace(/\/$/u, "");
};

const postMessages = async (
    endpoint: string,
    key: string,
    body: JsonRecord,
) => {
    const response = await fetch(`${endpoint}/v1/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(await responseError(response));
    return response;
};

const responseText = (payload: JsonRecord) =>
    asRecords(payload.content)
        .filter((entry) => entry.type === "text" && typeof entry.text === "string")
        .map((entry) => entry.text)
        .join("");

const smokeClaudeCodeRouter = async (
    config: JsonRecord,
    status: JsonRecord,
    model: string,
) => {
    const endpoint = gatewayEndpoint(config, status);
    const key = clientKey(config);
    const routedModel = `${PROVIDER_NAME}/${model}`;
    const pongResponse = await postMessages(endpoint, key, {
        model: routedModel,
        max_tokens: 8,
        messages: [
            { role: "user", content: "Reply with exactly one word: pong" },
        ],
    });
    const pong = responseText((await pongResponse.json()) as JsonRecord);
    if (pong.trim().toLowerCase() !== "pong") {
        throw new Error("Claude Code Router smoke check did not return exactly pong.");
    }

    const streamResponse = await postMessages(endpoint, key, {
        model: routedModel,
        max_tokens: 16,
        stream: true,
        messages: [{ role: "user", content: "Reply with exactly STREAM_OK" }],
    });
    const stream = await streamResponse.text();
    if (!stream.includes("STREAM_OK") || !stream.includes("message_stop")) {
        throw new Error("Claude Code Router streaming check did not complete.");
    }

    const toolResponse = await postMessages(endpoint, key, {
        model: routedModel,
        max_tokens: 64,
        messages: [
            {
                role: "user",
                content: "Call polli_probe exactly once with value set to ok.",
            },
        ],
        tools: [
            {
                name: "polli_probe",
                description: "Polli harness compatibility probe",
                input_schema: {
                    type: "object",
                    properties: { value: { type: "string" } },
                    required: ["value"],
                    additionalProperties: false,
                },
            },
        ],
        tool_choice: { type: "tool", name: "polli_probe" },
    });
    const payload = (await toolResponse.json()) as JsonRecord;
    const call = asRecords(payload.content).find(
        (entry) => entry.type === "tool_use" && entry.name === "polli_probe",
    );
    if (asRecord(call?.input)?.value !== "ok") {
        throw new Error("Claude Code Router tool-call check failed.");
    }
};

const baseResult = (
    ctx: HarnessContext,
    config?: JsonRecord,
    version?: string,
    ready = false,
): HarnessResult => {
    const installed = commandExists("ccr", ctx.env);
    const clientInstalled = commandExists("claude", ctx.env);
    const provider = config ? providerFrom(config) : undefined;
    const profile = config ? profileFrom(config) : undefined;
    const providerReady = providerLooksOurs(provider);
    const profileReady = profileLooksOurs(profile);
    const key =
        providerReady &&
        typeof provider?.api_key === "string" &&
        Boolean(provider.api_key.trim());
    const model = profileReady ? configuredModel(profile) : undefined;
    const prerequisites = [
        ...(!installed ? ["Install @musistudio/claude-code-router"] : []),
        ...(!clientInstalled ? ["Install @anthropic-ai/claude-code"] : []),
        ...(installed && !ready ? ["Start CCR with ccr start --no-open"] : []),
        ...(!providerReady ? ["Pollinations provider is missing"] : []),
        ...(!profileReady ? ["Pollinations Claude Code profile is missing"] : []),
        ...(!key ? ["Pollinations provider key is missing"] : []),
        ...(!model ? ["Pollinations model selection is missing"] : []),
    ];
    return {
        harness: ID,
        label: LABEL,
        installed,
        ready,
        version,
        provider: providerReady,
        key,
        configured:
            installed &&
            clientInstalled &&
            ready &&
            providerReady &&
            profileReady &&
            key &&
            Boolean(model),
        model,
        prerequisites,
        files: [serviceFile(ctx), journalFile(ctx)],
    };
};

const statusFromService = async (ctx: HarnessContext) => {
    const version = await readVersion(ctx);
    const [config, gateway] = await Promise.all([
        rpc<JsonRecord>(ctx, "getConfig"),
        rpc<JsonRecord>(ctx, "getGatewayStatus"),
    ]);
    const ready = gateway.state === "running";
    const result = baseResult(ctx, config, version, ready);
    if (!ready && typeof gateway.lastError === "string") {
        result.prerequisites = [
            ...(result.prerequisites ?? []),
            `CCR gateway: ${gateway.lastError}`,
        ];
    }
    return { config, gateway, result };
};

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Add an isolated Pollinations profile through Claude Code Router",
    restartHint: `Launch the isolated profile with: ccr "${PROFILE_NAME}"`,

    async on(ctx, options) {
        if (!commandExists("ccr", ctx.env)) {
            throw new Error(
                "Claude Code Router was not found. Install it with: npm install -g @musistudio/claude-code-router. Polli stopped before login or key creation.",
            );
        }
        if (!commandExists("claude", ctx.env)) {
            throw new Error(
                "Claude Code was not found. Install it with: npm install -g @anthropic-ai/claude-code. Polli stopped before login or key creation.",
            );
        }
        ensureService(ctx);
        await readVersion(ctx);
        const current = await rpc<JsonRecord>(ctx, "getConfig");
        const journal = loadJournal(ctx);
        const previousJournal = readTextIfExists(journalFile(ctx));
        assertNoCollisions(current, journal);

        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: providerKey(current, journal),
                accountPermissions: ["usage"],
            },
            { browser: options.browser },
        );
        const profileEnabledBefore =
            profileConfigFrom(current).enabled !== false;
        const update = configureClaudeCodeConfig(
            current,
            models,
            apiKey,
            model,
            journal,
        );

        let saveAttempted = false;
        try {
            saveAttempted = true;
            const configured = await rpc<JsonRecord>(ctx, "saveConfig", [
                update.config,
            ]);
            const actualUpdate = {
                config: configured,
                provider: providerFrom(configured),
                profile: profileFrom(configured),
            };
            if (!actualUpdate.provider || !actualUpdate.profile) {
                throw new Error("CCR did not persist the Pollinations provider and profile.");
            }
            saveJournal(
                ctx,
                actualUpdate as ConfigUpdate,
                journal?.profileEnabledBefore ?? profileEnabledBefore,
            );
            const gateway = await rpc<JsonRecord>(ctx, "getGatewayStatus");
            if (gateway.state !== "running") {
                throw new Error("CCR saved the profile but its gateway is not running.");
            }
            const smoke =
                options.smoke === false
                    ? false
                    : await verifyHarnessSmoke(apiKey, model, () =>
                          smokeClaudeCodeRouter(configured, gateway, model),
                      );
            return { ...(await claudeCode.status(ctx)), smoke };
        } catch (error) {
            try {
                if (saveAttempted) {
                    await rpc(ctx, "saveConfig", [current]);
                }
                if (previousJournal === null) removeIfExists(journalFile(ctx));
                else writeTextAtomic(journalFile(ctx), previousJournal, 0o600);
            } catch (rollbackError) {
                throw new AggregateError(
                    [error, rollbackError],
                    "Claude Code Router setup failed and its config could not be restored",
                );
            }
            throw error;
        }
    },

    async off(ctx) {
        const journal = loadJournal(ctx);
        if (!commandExists("ccr", ctx.env) || !journal) {
            return {
                ...baseResult(ctx),
                configured: false,
                outcome: "unchanged",
            };
        }
        ensureService(ctx);
        const current = await rpc<JsonRecord>(ctx, "getConfig");
        const stripped = stripClaudeCodeConfig(current, journal);
        if (!stripped.changed) {
            removeIfExists(journalFile(ctx));
            return {
                ...baseResult(ctx, current, await readVersion(ctx), true),
                configured: false,
                outcome: "unchanged",
            };
        }
        const configured = await rpc<JsonRecord>(ctx, "saveConfig", [
            stripped.config,
        ]);
        removeIfExists(journalFile(ctx));
        return {
            ...baseResult(ctx, configured, await readVersion(ctx), true),
            configured: false,
            outcome: stripped.outcome,
        };
    },

    async status(ctx) {
        if (!commandExists("ccr", ctx.env) || !existsSync(serviceFile(ctx))) {
            return baseResult(ctx);
        }
        try {
            const { result } = await statusFromService(ctx);
            return result;
        } catch (error) {
            const result = baseResult(ctx);
            result.prerequisites = [
                ...(result.prerequisites ?? []),
                error instanceof Error ? error.message : String(error),
            ];
            return result;
        }
    },
};
