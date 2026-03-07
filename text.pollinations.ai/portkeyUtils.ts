import debug from "debug";

const log = debug("pollinations:portkey-utils");
const errorLog = debug("pollinations:portkey-utils:error");

interface PortkeyTarget {
    authKey?: string | (() => string | Promise<string>);
    defaultOptions?: Record<string, unknown>;
    [key: string]: unknown;
}

interface PortkeyConfig {
    strategy?: { mode: string };
    targets?: PortkeyTarget[];
    useUserApiKey?: boolean;
    authKey?: string | (() => string | Promise<string>);
    removeSeed?: boolean;
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

async function resolveTargetAuth(
    target: PortkeyTarget,
): Promise<Record<string, unknown>> {
    const { authKey, defaultOptions, ...rest } = target;
    if (!authKey) return rest;

    const token = await resolveAuthKey(authKey);
    return { ...rest, api_key: token };
}

const SKIPPED_CONFIG_KEYS = new Set(["removeSeed", "authKey", "useUserApiKey"]);

export async function generatePortkeyHeaders(
    config: PortkeyConfig,
    requestOptions: RequestOptions = {},
): Promise<Record<string, string>> {
    if (!config) {
        errorLog("No configuration provided for header generation");
        throw new Error("No configuration provided for header generation");
    }

    if (config.strategy && config.targets) {
        log("Detected fallback/loadbalance config");
        const resolvedTargets = await Promise.all(
            config.targets.map(resolveTargetAuth),
        );
        const configPayload = {
            strategy: config.strategy,
            targets: resolvedTargets,
        };
        log(
            "Resolved fallback config:",
            JSON.stringify(configPayload, null, 2),
        );
        return { "x-portkey-config": JSON.stringify(configPayload) };
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
