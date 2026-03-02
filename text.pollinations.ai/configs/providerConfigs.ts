const DEFAULT_AZURE_API_VERSION = "2024-08-01-preview";

// =============================================================================
// Shared Types
// =============================================================================

interface ProviderConfig {
    provider: string;
    [key: string]: unknown;
}

interface ModelOverride {
    model?: string;
    [key: string]: unknown;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/** Creates a config for any OpenAI-compatible provider with a custom host. */
function createOpenAICompatibleConfig(
    customHost: string,
    authKey: string | undefined,
    overrides: ModelOverride = {},
): ProviderConfig {
    return {
        provider: "openai",
        "custom-host": customHost,
        authKey,
        ...overrides,
    };
}

function extractAzureResourceName(endpoint: string | undefined): string {
    if (!endpoint) return "pollinations";
    const match = endpoint.match(
        /https:\/\/([^.]+)\.(?:openai|cognitiveservices)\.azure\.com/,
    );
    const result = match?.[1];
    return !result || result === "undefined" ? "pollinations" : result;
}

function extractAzureDeploymentName(
    endpoint: string | undefined,
): string | null {
    if (!endpoint) return null;
    return endpoint.match(/\/deployments\/([^/]+)/)?.[1] ?? null;
}

function extractAzureApiVersion(endpoint: string | undefined): string {
    if (!endpoint)
        return process.env.OPENAI_API_VERSION || DEFAULT_AZURE_API_VERSION;
    return (
        endpoint.match(/api-version=([^&]+)/)?.[1] ??
        process.env.OPENAI_API_VERSION ??
        DEFAULT_AZURE_API_VERSION
    );
}

// =============================================================================
// Provider Factories
// =============================================================================

export function createAzureModelConfig(
    apiKey: string | undefined,
    endpoint: string | undefined,
    modelName: string,
    resourceName?: string,
): ProviderConfig {
    const deploymentId = extractAzureDeploymentName(endpoint) || modelName;
    return {
        provider: "azure-openai",
        "azure-api-key": apiKey,
        "azure-resource-name":
            resourceName || extractAzureResourceName(endpoint),
        "azure-deployment-id": deploymentId,
        "azure-api-version": extractAzureApiVersion(endpoint),
        "azure-model-name": deploymentId,
        authKey: apiKey,
    };
}

export function createBedrockNativeConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return {
        provider: "bedrock",
        "aws-access-key-id": process.env.AWS_ACCESS_KEY_ID,
        "aws-secret-access-key": process.env.AWS_SECRET_ACCESS_KEY,
        "aws-region": process.env.AWS_REGION || "us-east-1",
        ...overrides,
    };
}

export function createMyceliGrok4FastConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://myceli.services.ai.azure.com/openai/v1",
        process.env.AZURE_MYCELI_GROK_API_KEY,
        { model: "grok-4-fast-non-reasoning", ...overrides },
    );
}

export function createPerplexityModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return {
        provider: "perplexity-ai",
        authKey: process.env.PERPLEXITY_API_KEY,
        ...overrides,
    };
}

export function createOVHcloudModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://qwen-3-coder-30b-a3b-instruct.endpoints.kepler.ai.cloud.ovh.net/api/openai_compat/v1",
        process.env.OVHCLOUD_API_KEY,
        overrides,
    );
}

export function createOVHcloudMistralConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
        process.env.OVHCLOUD_API_KEY,
        overrides,
    );
}

export function createFireworksModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://api.fireworks.ai/inference/v1",
        process.env.FIREWORKS_API_KEY,
        overrides,
    );
}

export function createAirforceModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://api.airforce/v1",
        process.env.AIRFORCE_API_KEY,
        overrides,
    );
}

/**
 * Creates a NomNom model configuration (community model with web search/scrape/crawl).
 * Uses user's API key for billing passthrough - NomNom calls Pollinations internally.
 */
export function createNomNomConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return {
        provider: "openai",
        "custom-host": "https://scrape.pollinations.ai/v1",
        useUserApiKey: true,
        ...overrides,
    };
}

/**
 * Creates a Polly model configuration (community model - Pollinations AI assistant).
 * Uses user's API key for billing passthrough - Polly calls Pollinations internally.
 */
export function createPollyConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return {
        provider: "openai",
        "custom-host": "https://polly.pollinations.ai/v1",
        useUserApiKey: true,
        ...overrides,
    };
}

/**
 * Creates an Anthropic model configuration for direct Claude API access.
 */
export function createAnthropicConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return {
        provider: "anthropic",
        authKey: process.env.ANTHROPIC_API_KEY,
        defaultOptions: { max_tokens: 4096 },
        ...overrides,
    };
}
