import { BASE_URL } from "../lib/config.js";
import {
    CCR_INSTALL,
    type CcrConfig,
    type CcrProfile,
    type CcrProvider,
    ccrInstalled,
    ccrRpc,
    ccrServiceRunning,
    requireCcrService,
} from "./ccr.js";
import { commandExists } from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";
import { keyUsageCount, waitForKeyUsageIncrease } from "./usage-proof.js";

const ID = "claude-code";
const LABEL = "Claude Code";
const PROVIDER_ID = "pollinations-polli-harness";
const PROVIDER_NAME = "Pollinations";
const PROFILE_ID = "pollinations-claude-code";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const MIN_CCR_VERSION = [3, 1, 1] as const;

const versionParts = (value: string) =>
    value
        .trim()
        .replace(/^v/, "")
        .split(".")
        .slice(0, 3)
        .map((part) => Number.parseInt(part, 10));

export const ccrVersionCompatible = (value: string) => {
    const current = versionParts(value);
    if (current.length < 3 || current.some(Number.isNaN)) return false;
    for (let index = 0; index < 3; index += 1) {
        if (current[index] > MIN_CCR_VERSION[index]) return true;
        if (current[index] < MIN_CCR_VERSION[index]) return false;
    }
    return true;
};

const providerFor = (config: CcrConfig) =>
    config.Providers.find((item) => item.id === PROVIDER_ID);

const conflictingProvider = (config: CcrConfig) =>
    config.Providers.find(
        (item) =>
            item.id !== PROVIDER_ID &&
            item.name.trim().toLowerCase() === PROVIDER_NAME.toLowerCase(),
    );

const ownsProvider = (value: CcrProvider | undefined) =>
    Boolean(
        value &&
            value.id === PROVIDER_ID &&
            value.name === PROVIDER_NAME &&
            value.type === "openai_chat_completions" &&
            value.api_base_url?.replace(/\/$/, "") === `${BASE_URL}/v1`,
    );

const profileFor = (config: CcrConfig) =>
    config.profile.profiles.find((item) => item.id === PROFILE_ID);

const ownsProfile = (profile: CcrProfile | undefined) =>
    Boolean(
        profile &&
            profile.id === PROFILE_ID &&
            profile.name === "Pollinations" &&
            profile.agent === "claude-code" &&
            profile.scope === "ccr",
    );

// CCR's Anthropic-facing gateway uses a protocol prefix before the upstream
// model id. The provider remains Pollinations; CCR performs the wire translation.
const routeModel = (model: string) => `openai/${model}`;

const routerInfo = async (ctx: HarnessContext) => {
    if (!ccrInstalled(ctx) || !ccrServiceRunning(ctx)) {
        return { version: "", compatible: false };
    }
    const service = requireCcrService(ctx);
    const info = await ccrRpc<{ version?: string }>(service, "getAppInfo");
    const version = String(info.version ?? "");
    return { version, compatible: ccrVersionCompatible(version) };
};

const result = async (ctx: HarnessContext): Promise<HarnessResult> => {
    const router = ccrInstalled(ctx);
    const client = commandExists("claude", ctx.env);
    const serviceRunning = ccrServiceRunning(ctx);
    let version = "";
    let compatible = false;
    let providerReady = false;
    let profileReady = false;
    let model: string | undefined;
    let conflict = false;

    if (router && serviceRunning) {
        const info = await routerInfo(ctx);
        version = info.version;
        compatible = info.compatible;
        if (compatible) {
            const service = requireCcrService(ctx);
            const config = await ccrRpc<CcrConfig>(service, "getConfig");
            const provider = providerFor(config);
            conflict = Boolean(conflictingProvider(config));
            providerReady =
                ownsProvider(provider) && Boolean(provider?.api_key);
            const profile = profileFor(config);
            profileReady = ownsProfile(profile) && profile?.enabled === true;
            if (profile?.model?.startsWith("openai/")) {
                model = profile.model.slice("openai/".length);
            }
        }
    }

    const next = !router
        ? `Install Claude Code Router: ${CCR_INSTALL}`
        : !client
          ? "Install Claude Code: https://claude.com/claude-code"
          : !serviceRunning
            ? "Start Claude Code Router first: ccr start"
            : !compatible
              ? `Upgrade Claude Code Router to >= ${MIN_CCR_VERSION.join(".")}.`
              : conflict
                ? "A different provider named 'Pollinations' already exists in CCR; rename it before running Polli."
                : !providerReady || !profileReady
                  ? "Run: polli harness claude-code on"
                  : 'Ready. Launch with: ccr "Pollinations"';

    return {
        harness: ID,
        label: LABEL,
        configured: Boolean(
            router &&
                client &&
                serviceRunning &&
                compatible &&
                providerReady &&
                profileReady &&
                !conflict,
        ),
        model,
        files: [],
        routerInstalled: router,
        routerVersion: version || undefined,
        routerCompatible: compatible,
        routerReady: serviceRunning,
        clientInstalled: client,
        providerReady,
        profileReady,
        next,
    };
};

const smokeTest = async (
    config: CcrConfig,
    endpoint: string,
    model: string,
) => {
    if (!config.APIKEY?.trim()) {
        throw new Error(
            "Claude Code Router has no gateway client key. Create one in CCR before enabling the harness.",
        );
    }
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/v1/messages`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${config.APIKEY}`,
            "x-api-key": config.APIKEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model: routeModel(model),
            max_tokens: 24,
            messages: [
                {
                    role: "user",
                    content: "Reply with exactly one word: pong",
                },
            ],
        }),
    });
    const text = await response.text();
    if (!response.ok || !/\bpong\b/i.test(text)) {
        throw new Error(
            `Claude Code Router smoke test failed (${response.status}): ${text.slice(0, 400)}`,
        );
    }
};

export const configureClaudeCode = async (
    ctx: HarnessContext,
    settings: {
        apiKey: string;
        model: string;
        models: HarnessModel[];
    },
): Promise<HarnessResult> => {
    const service = requireCcrService(ctx);
    const original = await ccrRpc<CcrConfig>(service, "getConfig");
    const existing = providerFor(original);
    const conflict = conflictingProvider(original);

    if (conflict) {
        throw new Error(
            "Claude Code Router already has a different provider named 'Pollinations'. No changes were made.",
        );
    }
    if (existing && !ownsProvider(existing)) {
        throw new Error(
            "Claude Code Router contains the Polli provider id with foreign settings. No changes were made.",
        );
    }

    const next = structuredClone(original);
    const provider: CcrProvider = {
        ...(existing ?? {}),
        id: PROVIDER_ID,
        name: PROVIDER_NAME,
        provider: "pollinations",
        type: "openai_chat_completions",
        api_base_url: `${BASE_URL}/v1`,
        api_key: settings.apiKey,
        models: settings.models.map((item) => item.id),
        enabled: true,
    };
    next.Providers = [
        ...next.Providers.filter((item) => item.id !== PROVIDER_ID),
        provider,
    ];

    const existingProfile = profileFor(next);
    const profile: CcrProfile = {
        ...(existingProfile ?? {}),
        id: PROFILE_ID,
        name: "Pollinations",
        agent: "claude-code",
        enabled: true,
        scope: "ccr",
        surface: "cli",
        model: routeModel(settings.model),
        availableModels: settings.models.map((item) => routeModel(item.id)),
    };
    next.profile.profiles = [
        ...next.profile.profiles.filter((item) => item.id !== PROFILE_ID),
        profile,
    ];

    const beforeUsage = await keyUsageCount(settings.apiKey);
    const startedAt = Date.now();
    try {
        const saved = await ccrRpc<CcrConfig>(service, "saveConfig", next, {
            applyProfile: false,
        });
        const gateway = await ccrRpc<{
            endpoint?: string;
            state?: string;
        }>(service, "getGatewayStatus");
        if (!gateway.endpoint || gateway.state !== "running") {
            throw new Error(
                "Claude Code Router gateway is not running after configuration.",
            );
        }
        await smokeTest(saved, gateway.endpoint, settings.model);
        await waitForKeyUsageIncrease(settings.apiKey, beforeUsage, {
            afterMs: startedAt,
        });
    } catch (error) {
        await ccrRpc(service, "saveConfig", original, { applyProfile: false });
        throw error;
    }

    return { ...(await result(ctx)), smokeVerified: true };
};

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Use Pollinations in Claude Code through an isolated Claude Code Router profile",
    restartHint: 'Launch the isolated profile with: ccr "Pollinations"',

    async on(ctx, options) {
        if (!ccrInstalled(ctx)) {
            throw new Error(
                `Claude Code Router was not found. Install it first: ${CCR_INSTALL}`,
            );
        }
        if (!commandExists("claude", ctx.env)) {
            throw new Error(
                "Claude Code was not found. Install it first: https://claude.com/claude-code",
            );
        }
        if (!ccrServiceRunning(ctx)) {
            throw new Error(
                "Claude Code Router is not running. Start it with 'ccr start' before Polli login or key creation.",
            );
        }
        const info = await routerInfo(ctx);
        if (!info.compatible) {
            throw new Error(
                `Claude Code Router ${info.version || "unknown"} is unsupported; upgrade to >= ${MIN_CCR_VERSION.join(".")} before Polli login or key creation.`,
            );
        }

        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        const service = requireCcrService(ctx);
        const config = await ccrRpc<CcrConfig>(service, "getConfig");
        const current = providerFor(config);
        if (conflictingProvider(config)) {
            throw new Error(
                "A different CCR provider named 'Pollinations' already exists. No changes were made.",
            );
        }
        if (current && !ownsProvider(current)) {
            throw new Error(
                "The CCR Polli provider id already exists with foreign settings. No changes were made.",
            );
        }

        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: current?.api_key?.trim() || null,
            },
            { browser: options.browser },
        );
        return configureClaudeCode(ctx, { apiKey, model, models });
    },

    async off(ctx) {
        if (!ccrInstalled(ctx) || !ccrServiceRunning(ctx)) {
            return {
                ...(await result(ctx)),
                configured: false,
                outcome: "unchanged",
            };
        }
        const service = requireCcrService(ctx);
        const config = await ccrRpc<CcrConfig>(service, "getConfig");
        const current = providerFor(config);
        const profile = profileFor(config);
        const ownedProvider = ownsProvider(current);
        const ownedProfile = ownsProfile(profile);
        if (!ownedProvider && !ownedProfile) {
            return {
                ...(await result(ctx)),
                configured: false,
                outcome: "unchanged",
            };
        }
        const next = structuredClone(config);
        if (ownedProvider) {
            next.Providers = next.Providers.filter(
                (item) => item.id !== PROVIDER_ID,
            );
        }
        if (ownedProfile) {
            next.profile.profiles = next.profile.profiles.filter(
                (item) => item.id !== PROFILE_ID,
            );
        }
        await ccrRpc(service, "saveConfig", next, { applyProfile: false });
        return {
            ...(await result(ctx)),
            configured: false,
            outcome: "stripped",
        };
    },

    status: result,
};
