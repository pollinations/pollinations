import debug from "debug";
const log = debug("pollinations:portkey-utils");
const errorLog = debug("pollinations:portkey-utils:error");

/**
 * Refreshes the Google Cloud access token by executing the gcloud CLI command
 * @returns {string} The new access token
 */
// Helper function to extract resource name from Azure endpoint

export function extractResourceName(endpoint) {
    if (endpoint === undefined || endpoint === null) return null;
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

    // If we can't extract the resource name, use a default value
    if (!result || result === "undefined" || result === undefined) {
        log("Using default resource name: pollinations");
        return "pollinations";
    }

    return result;
} // Extract deployment names from endpoints

export function extractDeploymentName(endpoint) {
    if (!endpoint) return null;
    log("Extracting deployment name from endpoint:", endpoint);

    // Extract deployment name (e.g., gpt-4o-mini from .../deployments/gpt-4o-mini/...)
    const match = endpoint.match(/\/deployments\/([^/]+)/);
    log("Extracted deployment name:", match ? match[1] : null);
    return match ? match[1] : null;
}
// Extract API version from endpoints

export function extractApiVersion(endpoint) {
    if (!endpoint)
        return process.env.OPENAI_API_VERSION || "2024-08-01-preview";
    log("Extracting API version from endpoint:", endpoint);

    // Extract API version (e.g., 2024-08-01-preview from ...?api-version=2024-08-01-preview)
    const match = endpoint.match(/api-version=([^&]+)/);
    const version = match
        ? match[1]
        : process.env.OPENAI_API_VERSION || "2024-08-01-preview";
    log("Extracted API version:", version);
    return version;
}

/**
 * Resolve authKey functions for a target object.
 * Configs should already use snake_case keys as required by Portkey.
 * @param {Object} target - Target configuration object
 * @returns {Object} - Target with resolved auth token
 */
async function resolveTargetAuth(target) {
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

export /**
 * Generate Portkey headers from a configuration object
 * @param {Object} config - Model configuration object
 * @param {Object} requestOptions - Request options (optional, for user API key passthrough)
 * @returns {Object} - Headers object with x-portkey prefixes
 */
async function generatePortkeyHeaders(config, requestOptions = {}) {
    if (!config) {
        errorLog("No configuration provided for header generation");
        throw new Error("No configuration provided for header generation");
    }

    // Check if this is a fallback/loadbalance config with strategy and targets
    if (config.strategy && config.targets) {
        log(
            "Detected fallback/loadbalance config, using x-portkey-config header",
        );

        // Resolve authKey for each target
        const resolvedTargets = await Promise.all(
            config.targets.map(resolveTargetAuth),
        );

        // Build the config object for x-portkey-config header
        const configPayload = {
            strategy: config.strategy,
            targets: resolvedTargets,
        };

        log(
            "Resolved fallback config:",
            JSON.stringify(configPayload, null, 2),
        );

        return {
            "x-portkey-config": JSON.stringify(configPayload),
        };
    }

    // Use individual headers approach (proven to work with Azure OpenAI)
    // Set strictOpenAiCompliance to false to enable Perplexity citations
    // NOTE: Must be "strict-open-ai-compliance" (with dash between "open" and "ai")
    const headers = {
        "x-portkey-strict-open-ai-compliance": "false",
    };

    // Get the auth key
    let apiKey;

    // Check if this model uses user's API key for billing passthrough (e.g., NomNom)
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

    // Add all config properties as individual x-portkey-* headers
    for (const [key, value] of Object.entries(config)) {
        // Skip internal properties
        if (
            key === "removeSeed" ||
            key === "authKey" ||
            key === "useUserApiKey"
        )
            continue;

        // Add as individual header with x-portkey- prefix
        headers[`x-portkey-${key}`] = value;
    }

    // Add Authorization header if we have an API key
    if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
    }

    log("Generated Portkey headers:", Object.keys(headers));
    log(
        "strictOpenAiCompliance header value:",
        headers["x-portkey-strict-open-ai-compliance"],
    );
    return headers;
}
