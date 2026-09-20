import {
    CCR_INSTALL,
    type CcrConfig,
    ccrInstalled,
    ensureService,
    gatewayBase,
    PROFILE_ID,
    PROVIDER_NAME,
    providerFor,
    rpc,
    serviceRunning,
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

const ID = "claude-code";
const LABEL = "Claude Code";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";

// The CCR gateway addresses a model as `<protocol>/<model>`; Pollinations is
// registered as an OpenAI chat-completions provider.
const ROUTE = (model: string) => `openai/${model}`;

/** One-word request through the CCR gateway, so a broken route fails `on` early. */
const smokeTest = async (config: CcrConfig, gateway: string, model: string) => {
    const res = await fetch(`${gateway}/v1/messages`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-api-key": config.APIKEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: ROUTE(model),
            max_tokens: 64,
            messages: [
                { role: "user", content: "Reply with the single word: pong" },
            ],
        }),
    });
    const text = await res.text();
    if (!res.ok || !/pong/i.test(text)) {
        throw new Error(
            `Smoke test through Claude Code Router failed (${res.status}): ${text.slice(0, 400)}`,
        );
    }
};

export const configureClaudeCode = async (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string; models: HarnessModel[] },
) => {
    const service = await ensureService(ctx);
    const config = await rpc<CcrConfig>(service, "getConfig");
    const before = structuredClone(config);
    config.Providers = [
        ...config.Providers.filter((p) => p.name !== PROVIDER_NAME),
        {
            ...providerFor(config),
            name: PROVIDER_NAME,
            api_base_url: gatewayBase,
            api_key: settings.apiKey,
            models: settings.models.map((m) => m.id),
        },
    ];
    config.profile.profiles = [
        ...config.profile.profiles.filter((p) => p.id !== PROFILE_ID),
        {
            ...config.profile.profiles.find((p) => p.id === PROFILE_ID),
            id: PROFILE_ID,
            name: "Pollinations",
            agent: "claude-code",
            enabled: true,
            // "ccr" scope applies only to `ccr Pollinations`; the global scope
            // would take over ~/.claude/settings.json and replace the native login.
            scope: "ccr",
            model: ROUTE(settings.model),
        },
    ];
    const saved = await rpc<CcrConfig>(service, "saveConfig", config);
    try {
        const { endpoint } = await rpc<{ endpoint: string }>(
            service,
            "getGatewayStatus",
        );
        await smokeTest(saved, endpoint, settings.model);
    } catch (error) {
        await rpc(service, "saveConfig", before);
        throw error;
    }
};

const result = async (ctx: HarnessContext): Promise<HarnessResult> => {
    const details: Record<string, string | boolean> = {
        router: ccrInstalled(ctx),
        client: commandExists("claude", ctx.env),
        service: serviceRunning(ctx),
    };
    const base = { harness: ID, label: LABEL, files: [], details };
    if (!details.router || !details.service) {
        details.next = details.router
            ? "Start the router: ccr start"
            : `Install the router: ${CCR_INSTALL}`;
        return { ...base, configured: false };
    }
    const service = await ensureService(ctx);
    const config = await rpc<CcrConfig>(service, "getConfig");
    const provider = providerFor(config);
    const profile = config.profile.profiles.find((p) => p.id === PROFILE_ID);
    details.provider = Boolean(provider?.api_key);
    details.profile = Boolean(profile?.enabled);
    if (!details.client)
        details.next = "Install Claude Code: https://claude.com/claude-code";
    return {
        ...base,
        configured: Boolean(provider?.api_key && profile?.enabled),
        model: profile?.model.replace(/^openai\//, ""),
    };
};

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Route Claude Code through Claude Code Router to Pollinations",
    restartHint: 'Launch it with: ccr "Pollinations"',

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
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        const service = await ensureService(ctx);
        const existing = providerFor(
            await rpc<CcrConfig>(service, "getConfig"),
        );
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: existing?.api_key ?? null,
                accountPermissions: ["profile", "usage"],
            },
            { browser: options.browser },
        );
        await configureClaudeCode(ctx, { apiKey, model, models });
        return result(ctx);
    },

    async off(ctx) {
        if (!ccrInstalled(ctx) || !serviceRunning(ctx)) {
            return {
                ...(await result(ctx)),
                configured: false,
                outcome: "unchanged",
            };
        }
        const service = await ensureService(ctx);
        const config = await rpc<CcrConfig>(service, "getConfig");
        const owned =
            providerFor(config) !== undefined ||
            config.profile.profiles.some((p) => p.id === PROFILE_ID);
        if (owned) {
            config.Providers = config.Providers.filter(
                (p) => p.name !== PROVIDER_NAME,
            );
            config.profile.profiles = config.profile.profiles.filter(
                (p) => p.id !== PROFILE_ID,
            );
            await rpc(service, "saveConfig", config);
        }
        return {
            ...(await result(ctx)),
            configured: false,
            outcome: owned ? "stripped" : "unchanged",
        };
    },

    status: result,
};
