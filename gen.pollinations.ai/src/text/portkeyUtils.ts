import debug from "debug";

const log = debug("pollinations:portkey-utils");
const errorLog = debug("pollinations:portkey-utils:error");

interface PortkeyTarget {
    authKey?: string | (() => string | Promise<string>);
    [key: string]: unknown;
}

interface PortkeyConfig {
    strategy?: { mode: string; on_status_codes?: number[] };
    targets?: PortkeyTarget[];
    useUserApiKey?: boolean;
    authKey?: string | (() => string | Promise<string>);
    [key: string]: unknown;
}

interface RequestOptions {
    userApiKey?: string;
    [key: string]: unknown;
}

async function resolveAuthKey(
    authKey: string | (() => string | Promise<string>),
): Promise<string> {
    return typeof authKey === "function" ? await authKey() : authKey;
}

/** Resolves a target's authKey into a per-target `api_key` for x-portkey-config. */
async function resolveTargetAuth(
    target: PortkeyTarget,
): Promise<Record<string, unknown>> {
    const { authKey, ...rest } = target;
    if (!authKey) return rest;
    const token = await resolveAuthKey(authKey);
    return { ...rest, api_key: token };
}

// Gateway-internal config keys that must not be forwarded as x-portkey-* headers.
const SKIPPED_CONFIG_KEYS = new Set([
    "authKey",
    "useUserApiKey",
    "defaultOptions",
    "requiresBase64ImageUrls",
]);

export async function generatePortkeyHeaders(
    config: PortkeyConfig,
    requestOptions: RequestOptions = {},
): Promise<Record<string, string>> {
    if (!config) {
        errorLog("No configuration provided for header generation");
        throw new Error("No configuration provided for header generation");
    }

    // Fallback/loadbalance config: emit a single x-portkey-config JSON blob with
    // per-target credentials instead of flattening into x-portkey-* headers.
    // The strict-compliance header still applies request-wide (across every
    // target), so keep it — Gemini needs it to return thinking/thought_signature.
    if (config.strategy && config.targets) {
        const resolvedTargets = await Promise.all(
            config.targets.map(resolveTargetAuth),
        );
        log("Resolved fallback config targets:", {
            targetCount: resolvedTargets.length,
            providers: resolvedTargets.map((target) => target.provider),
        });
        return {
            "x-portkey-strict-open-ai-compliance": "false",
            "x-portkey-config": JSON.stringify({
                strategy: config.strategy,
                targets: resolvedTargets,
            }),
        };
    }

    const headers: Record<string, string> = {
        "x-portkey-strict-open-ai-compliance": "false",
    };

    let apiKey: string | undefined;

    if (config.useUserApiKey && requestOptions.userApiKey) {
        apiKey = requestOptions.userApiKey;
        log("Using user's API key for billing passthrough");
    } else if (config.authKey) {
        apiKey = await resolveAuthKey(config.authKey);
    }

    for (const [key, value] of Object.entries(config)) {
        if (SKIPPED_CONFIG_KEYS.has(key)) continue;
        headers[`x-portkey-${key}`] = String(value);
    }

    if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
    }

    log("Generated Portkey headers:", Object.keys(headers));
    return headers;
}
