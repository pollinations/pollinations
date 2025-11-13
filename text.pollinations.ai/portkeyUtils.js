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

export /**
 * Generate Portkey headers from a configuration object
 * @param {Object} config - Model configuration object
 * @returns {Object} - Headers object with x-portkey prefixes
 */
async function generatePortkeyHeaders(config) {
    if (!config) {
        errorLog("No configuration provided for header generation");
        throw new Error("No configuration provided for header generation");
    }

    // Build the complete Portkey config object
    const portkeyConfig = {
        strictOpenAiCompliance: false, // Enable citations and non-OpenAI fields
    };

    // Get the auth key
    let apiKey;
    if (config.authKey) {
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

    // Add all config properties to the Portkey config object
    for (const [key, value] of Object.entries(config)) {
        // Skip internal properties
        if (key === "removeSeed" || key === "authKey") continue;
        
        // Convert kebab-case to snake_case for Portkey
        const configKey = key.replace(/-/g, "_");
        portkeyConfig[configKey] = value;
    }

    // Add api_key if we have one
    if (apiKey) {
        portkeyConfig.api_key = apiKey;
    }

    // Return single x-portkey-config header with complete JSON object
    return {
        "x-portkey-config": JSON.stringify(portkeyConfig),
    };
}
