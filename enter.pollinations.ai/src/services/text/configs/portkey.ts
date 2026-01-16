/**
 * Portkey header generation utilities for the text service.
 * Generates x-portkey-* headers from configuration objects.
 */

import type { ProviderConfig } from "./providers.js";

interface PortkeyTarget {
    authKey?: string | (() => string | Promise<string>);
    defaultOptions?: Record<string, unknown>;
    [key: string]: unknown;
}

/**
 * Resolve authKey functions for a target object.
 * Configs should already use snake_case keys as required by Portkey.
 */
async function resolveTargetAuth(
    target: PortkeyTarget,
): Promise<Record<string, unknown>> {
    const { authKey, defaultOptions, ...rest } = target;

    if (!authKey) {
        return rest;
    }

    try {
        const token = typeof authKey === "function" ? await authKey() : authKey;
        return { ...rest, api_key: token };
    } catch (error) {
        console.error("Error resolving auth for target:", error);
        throw error;
    }
}

/**
 * Generate Portkey headers from a configuration object
 */
export async function generatePortkeyHeaders(
    config: ProviderConfig,
): Promise<Record<string, string>> {
    if (!config) {
        throw new Error("No configuration provided for header generation");
    }

    // Check if this is a fallback/loadbalance config with strategy and targets
    if (config.strategy && (config as { targets?: PortkeyTarget[] }).targets) {
        const targets = (config as { targets: PortkeyTarget[] }).targets;

        // Resolve authKey for each target
        const resolvedTargets = await Promise.all(
            targets.map(resolveTargetAuth),
        );

        // Build the config object for x-portkey-config header
        const configPayload = {
            strategy: config.strategy,
            targets: resolvedTargets,
        };

        return {
            "x-portkey-config": JSON.stringify(configPayload),
        };
    }

    // Use individual headers approach (proven to work with Azure OpenAI)
    // Set strictOpenAiCompliance to false to enable Perplexity citations
    const headers: Record<string, string> = {
        "x-portkey-strict-open-ai-compliance": "false",
    };

    // Get the auth key
    let apiKey: string | undefined;
    if (config.authKey) {
        try {
            if (typeof config.authKey === "function") {
                const token = config.authKey();
                apiKey = token instanceof Promise ? await token : token;
            } else {
                apiKey = config.authKey;
            }
        } catch (error) {
            console.error("Error getting auth token:", error);
            throw error;
        }
    }

    // Add all config properties as individual x-portkey-* headers
    for (const [key, value] of Object.entries(config)) {
        // Skip internal properties
        if (
            key === "removeSeed" ||
            key === "authKey" ||
            key === "defaultOptions"
        )
            continue;

        // Add as individual header with x-portkey- prefix
        if (value !== undefined && value !== null) {
            headers[`x-portkey-${key}`] = String(value);
        }
    }

    // Add Authorization header if we have an API key
    if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
    }

    return headers;
}
