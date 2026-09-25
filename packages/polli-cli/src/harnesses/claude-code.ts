import { createHash } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
    CCR_INSTALL,
    type CcrConfig,
    type CcrService,
    CLAUDE_INSTALL,
    ccrConfigFile,
    ccrInstalled,
    ccrVersion,
    ccrVersionSupported,
    claudeInstalled,
    gatewayBase,
    MIN_CCR_VERSION,
    PROFILE_ID,
    PROVIDER_NAME,
    profileFor,
    providerFor,
    readConfig,
    requireService,
    routeModel,
    rpc,
    serviceRunning,
    writeConfig,
} from "./ccr.js";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
import { keyIsValid, resolveHarnessKey } from "./keys.js";
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
const DEFAULT_MODEL = "openai/gpt-5.4-nano";

const sha256 = (content: string) =>
    createHash("sha256").update(content).digest("hex");

/**
 * Snapshot of the CCR config document around the first successful `on`.
 * `before` is the exact JSON text prior to our change (null when
 * config.sqlite did not exist); `afterHash` lets `off` detect outside edits
 * without keeping a second live copy of the key beyond the router's own.
 */
interface ConfigSnapshot {
    complete: boolean;
    before: string | null;
    afterHash: string | null;
}

const snapshotPath = (ctx: HarnessContext) =>
    join(ctx.home, ".pollinations", "harnesses", "claude-code.json");

const loadSnapshot = (ctx: HarnessContext): ConfigSnapshot | null => {
    const text = readTextIfExists(snapshotPath(ctx));
    if (!text) return null;
    try {
        return JSON.parse(text) as ConfigSnapshot;
    } catch {
        return null;
    }
};

const saveSnapshot = (ctx: HarnessContext, snapshot: ConfigSnapshot) =>
    writeTextAtomic(
        snapshotPath(ctx),
        JSON.stringify(snapshot, null, 2),
        0o600,
    );

const clearSnapshot = (ctx: HarnessContext) =>
    removeIfExists(snapshotPath(ctx));

const emptyConfig = (): CcrConfig => ({
    Providers: [],
    profile: { profiles: [] },
    APIKEY: "",
});

/** One-word request through the CCR gateway so a broken route fails `on`. */
const smokeTest = async (
    service: CcrService,
    config: CcrConfig,
    model: string,
) => {
    const { endpoint } = await rpc<{ endpoint: string }>(
        service,
        "getGatewayStatus",
    );
    const res = await fetch(`${endpoint}/v1/messages`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-api-key": config.APIKEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: routeModel(model),
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

const applyEntries = (
    config: CcrConfig,
    settings: { apiKey: string; model: string; models: HarnessModel[] },
): CcrConfig => ({
    ...config,
    Providers: [
        ...(config.Providers ?? []).filter((p) => p.name !== PROVIDER_NAME),
        {
            name: PROVIDER_NAME,
            api_base_url: gatewayBase,
            api_key: settings.apiKey,
            models: settings.models.map((m) => m.id),
        },
    ],
    profile: {
        ...config.profile,
        profiles: [
            ...(config.profile?.profiles ?? []).filter(
                (p) => p.id !== PROFILE_ID,
            ),
            {
                id: PROFILE_ID,
                name: "Pollinations",
                agent: "claude-code",
                enabled: true,
                // "ccr" scope applies only to `ccr "Pollinations"`, so the
                // user's native Claude login and settings stay untouched.
                scope: "ccr",
                model: routeModel(settings.model),
            },
        ],
    },
});

const stripEntries = (config: CcrConfig): boolean => {
    let changed = false;
    const providers = config.Providers ?? [];
    if (providers.some((p) => p.name === PROVIDER_NAME)) {
        config.Providers = providers.filter((p) => p.name !== PROVIDER_NAME);
        changed = true;
    }
    const profiles = config.profile?.profiles ?? [];
    if (profiles.some((p) => p.id === PROFILE_ID)) {
        config.profile = {
            ...config.profile,
            profiles: profiles.filter((p) => p.id !== PROFILE_ID),
        };
        changed = true;
    }
    return changed;
};

const keyState = async (key: string | undefined | null) => {
    if (!key) return false as const;
    try {
        return (await keyIsValid(key))
            ? ("valid" as const)
            : ("invalid" as const);
    } catch {
        return "unknown" as const;
    }
};

const result = async (ctx: HarnessContext): Promise<HarnessResult> => {
    const version = ccrVersion(ctx);
    const details: Record<string, string | boolean> = {
        router: ccrInstalled(ctx),
        client: claudeInstalled(ctx),
        service: serviceRunning(ctx),
        version: version ?? "unknown",
    };
    const base = { harness: ID, label: LABEL, files: [], details };

    if (!details.router) {
        details.next = `Install the router: ${CCR_INSTALL}`;
        return { ...base, configured: false };
    }
    if (!ccrVersionSupported(version)) {
        details.next = `Upgrade Claude Code Router (need >= ${MIN_CCR_VERSION}): ${CCR_INSTALL}`;
        return { ...base, configured: false };
    }
    if (!details.service) {
        details.next = "Start the router: ccr start";
    }
    if (!details.client) {
        details.next = `Install Claude Code: ${CLAUDE_INSTALL}`;
    }

    let config: CcrConfig | null = null;
    try {
        config = await readConfig(ctx);
    } catch {
        config = null;
    }
    const provider = config ? providerFor(config) : undefined;
    const profile = config ? profileFor(config) : undefined;
    details.provider = Boolean(provider);
    details.key = await keyState(provider?.api_key);
    details.profile = Boolean(profile?.enabled);

    const configured = Boolean(
        provider &&
            details.key !== false &&
            details.key !== "invalid" &&
            profile?.enabled &&
            details.service,
    );
    return {
        ...base,
        configured,
        model: profile?.model
            ? profile.model.replace(/^openai\//, "")
            : undefined,
    };
};

export const configureClaudeCode = async (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string; models: HarnessModel[] },
): Promise<HarnessResult> => {
    const service = requireService(ctx);
    const beforeConfig = await readConfig(ctx);
    const existed = existsSync(ccrConfigFile(ctx));
    const before = beforeConfig ? JSON.stringify(beforeConfig) : null;
    const existing = loadSnapshot(ctx);
    const snapshot: ConfigSnapshot = existing ?? {
        complete: false,
        before,
        afterHash: null,
    };
    if (!existing) saveSnapshot(ctx, snapshot);

    const config = applyEntries(beforeConfig ?? emptyConfig(), settings);
    try {
        await rpc(service, "saveConfig", config);
        const saved = await rpc<CcrConfig>(service, "getConfig");
        await smokeTest(service, saved, settings.model);
        snapshot.afterHash = sha256(JSON.stringify(saved));
        snapshot.complete = true;
        saveSnapshot(ctx, snapshot);
    } catch (error) {
        // Roll the router back to the exact pre-change document.
        try {
            if (beforeConfig) await rpc(service, "saveConfig", beforeConfig);
            else if (!existed && !serviceRunning(ctx)) {
                removeIfExists(ccrConfigFile(ctx));
            }
        } finally {
            if (!existing) clearSnapshot(ctx);
        }
        throw error;
    }
    return result(ctx);
};

export const disableClaudeCode = async (
    ctx: HarnessContext,
): Promise<HarnessResult> => {
    const snapshot = loadSnapshot(ctx);
    const current = await readConfig(ctx);
    const currentText = current ? JSON.stringify(current) : null;
    let outcome: OffOutcome;

    if (
        snapshot?.complete &&
        currentText !== null &&
        snapshot.afterHash === sha256(currentText)
    ) {
        if (snapshot.before === null) {
            // We created config.sqlite; remove it only while the service is down.
            if (!serviceRunning(ctx) && existsSync(ccrConfigFile(ctx))) {
                rmSync(ccrConfigFile(ctx), { force: true });
                outcome = "restored";
            } else {
                const stripped = current ? stripEntries(current) : false;
                if (stripped && current) await writeConfig(ctx, current);
                outcome = stripped ? "stripped" : "unchanged";
            }
        } else {
            await writeConfig(ctx, JSON.parse(snapshot.before) as CcrConfig);
            outcome = "restored";
        }
    } else {
        const stripped = current ? stripEntries(current) : false;
        if (stripped && current) await writeConfig(ctx, current);
        outcome = stripped ? "stripped" : "unchanged";
    }
    clearSnapshot(ctx);

    return { ...(await result(ctx)), configured: false, outcome };
};

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Route Claude Code through Claude Code Router to Pollinations",
    restartHint:
        'Launch it with: ccr "Pollinations" (restart the router first if it was stopped).',

    async on(ctx, options) {
        if (!ccrInstalled(ctx)) {
            throw new Error(
                `Claude Code Router was not found. Install it first: ${CCR_INSTALL}`,
            );
        }
        if (!claudeInstalled(ctx)) {
            throw new Error(
                `Claude Code was not found. Install it first: ${CLAUDE_INSTALL}`,
            );
        }
        const version = ccrVersion(ctx);
        if (!ccrVersionSupported(version)) {
            throw new Error(
                `Claude Code Router ${version ?? "(unknown)"} is too old for the management RPC. Upgrade: ${CCR_INSTALL}`,
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        // Fails fast when the router is not running — do not mint a key first.
        requireService(ctx);
        const existing = providerFor((await readConfig(ctx)) ?? emptyConfig());
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

    off: disableClaudeCode,
    status: result,
};
