import debug from "debug";

const log = debug("pollinations:portkey-utils");
const errorLog = debug("pollinations:portkey-utils:error");

export function extractResourceName(endpoint: string | null | undefined): string | null {
    if (endpoint == null) return null;
    log("Extracting resource name from endpoint:", endpoint);

    // Extract resource name from both Azure OpenAI patterns:
    // 1. https://pollinations4490940554.openai.azure.com
    // 2. https://gpt-image-jp.cognitiveservices.azure.com
    let match = endpoint.match(/https:\/\/([^.]+)\.openai\.azure\.com/);
    if (!match) {
        match = endpoint.match(
            /https:\/\/([^.]+)\.cognitiveservices\.azure\.com/,
        );
    }

    const result = match ? match[1] : null;
    log("Extracted resource name:", result);

    if (!result || result === "undefined") {
        log("Using default resource name: pollinations");
        return "pollinations";
    }
    return result;
}

export function extractDeploymentName(endpoint: string | null | undefined): string | null {
    if (!endpoint) return null;
    log("Extracting deployment name from endpoint:", endpoint);

    const match = endpoint.match(/\/deployments\/([^/]+)/);
    log("Extracted deployment name:", match?.[1] ?? null);
    return match?.[1] ?? null;
}

export function extractApiVersion(endpoint: string | null | undefined): string {
    if (!endpoint) return process.env.OPENAI_API_VERSION || "2024-08-01-preview";
    log("Extracting API version from endpoint:", endpoint);

    const match = endpoint.match(/api-version=([^&]+)/);
    const version = match?.[1] ?? process.env.OPENAI_API_VERSION ?? "2024-08-01-preview";
    log("Extracted API version:", version);
    return version;
}

async function resolveTargetAuth(target: any): Promise<any> {
    const { authKey, defaultOptions, ...rest } = target;

    if (!authKey) {
        return rest;
    }

    try {
        const token = typeof authKey === "function" ? await authKey() : authKey;
        return { ...rest, api_key: token };
    } catch (error) {
        errorLog("Error resolving auth for target:", error);
        throw error;
    }
}

export async function generatePortkeyHeaders(config: any, requestOptions: any = {}): Promise<Record<string, string>> {
    if (!config) {
        errorLog("No configuration provided for header generation");
        throw new Error("No configuration provided for header generation");
    }

    if (config.strategy && config.targets) {
        log("Detected fallback/loadbalance config");

        const resolvedTargets = await Promise.all(config.targets.map(resolveTargetAuth));
        const configPayload = { strategy: config.strategy, targets: resolvedTargets };

        log("Resolved fallback config:", JSON.stringify(configPayload, null, 2));

        return { "x-portkey-config": JSON.stringify(configPayload) };
    }

    const headers: Record<string, string> = {
        "x-portkey-strict-open-ai-compliance": "false",
    };

    let apiKey: string | undefined;

    if (config.useUserApiKey && requestOptions?.userApiKey) {
        apiKey = requestOptions.userApiKey;
        log("Using user's API key for billing passthrough");
    } else if (config.authKey) {
        try {
            if (typeof config.authKey === "function") {
                const token = config.authKey();
                apiKey = token instanceof Promise ? await token : token;
            } else {
                apiKey = config.authKey;
            }
        } catch (error) {
            errorLog("Error getting auth token:", error);
            throw error;
        }
    }

    for (const [key, value] of Object.entries(config)) {
        if (key === "removeSeed" || key === "authKey" || key === "useUserApiKey") continue;
        headers[`x-portkey-${key}`] = String(value);
    }

    if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
    }

    log("Generated Portkey headers:", Object.keys(headers));
    return headers;
}
