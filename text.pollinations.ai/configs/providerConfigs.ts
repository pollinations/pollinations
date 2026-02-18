import {
    extractApiVersion,
    extractDeploymentName,
    extractResourceName,
} from "../portkeyUtils.js";

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

// =============================================================================
// Provider Factories
// =============================================================================

export function createAzureModelConfig(
    apiKey: string | undefined,
    endpoint: string | undefined,
    modelName: string,
    resourceName?: string,
): ProviderConfig {
    const deploymentId = extractDeploymentName(endpoint) || modelName;
    return {
        provider: "azure-openai",
        "azure-api-key": apiKey,
        "azure-resource-name": resourceName || extractResourceName(endpoint),
        "azure-deployment-id": deploymentId,
        "azure-api-version": extractApiVersion(endpoint),
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

export function createScalewayModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        process.env.SCALEWAY_BASE_URL || "https://api.scaleway.com/ai-apis/v1",
        process.env.SCALEWAY_API_KEY,
        overrides,
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
