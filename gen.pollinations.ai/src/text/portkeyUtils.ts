import debug from "debug";

const log = debug("pollinations:portkey-utils");
const errorLog = debug("pollinations:portkey-utils:error");

interface PortkeyConfig {
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
