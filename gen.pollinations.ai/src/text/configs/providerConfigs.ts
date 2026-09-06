import { textEnvironmentValue } from "../environment.js";

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

function parseAzureEndpoint(endpoint: string) {
    const url = new URL(endpoint);
    const resourceName = url.hostname.match(
        /^([^.]+)\.(?:openai|cognitiveservices)\.azure\.com$/,
    )?.[1];
    const deploymentId = url.pathname.match(/\/deployments\/([^/]+)\//)?.[1];
    const apiVersion = url.searchParams.get("api-version");
    if (!resourceName || !deploymentId || !apiVersion) {
        throw new Error(`Invalid Azure OpenAI endpoint: ${endpoint}`);
    }
    return { resourceName, deploymentId, apiVersion };
}

// =============================================================================
// Provider Factories
// =============================================================================

export function createAzureModelConfig(
    apiKey: string | undefined,
    endpoint: string,
    overrides: ModelOverride = {},
): ProviderConfig {
    const { resourceName, deploymentId, apiVersion } =
        parseAzureEndpoint(endpoint);
    return {
        provider: "azure-openai",
        "azure-api-key": apiKey,
        "azure-resource-name": resourceName,
        "azure-deployment-id": deploymentId,
        "azure-api-version": apiVersion,
        "azure-model-name": deploymentId,
        authKey: apiKey,
        ...overrides,
    };
}

/** Azure OpenAI v1 transport for deployments proven on the Responses API. */
export function createAzureResponsesModelConfig(
    apiKey: string | undefined,
    endpoint: string,
    overrides: ModelOverride = {},
): ProviderConfig {
    const { resourceName } = parseAzureEndpoint(endpoint);
    return createAzureModelConfig(apiKey, endpoint, {
        responsesEndpoint: `https://${resourceName}.openai.azure.com/openai/v1/responses`,
        responsesAuthHeader: "api-key",
        ...overrides,
    });
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

export function createFireworksModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://api.fireworks.ai/inference/v1",
        textEnvironmentValue("FIREWORKS_NEO_API_KEY"),
        {
            responsesEndpoint:
                "https://api.fireworks.ai/inference/v1/responses",
            ...overrides,
        },
    );
}

export function createDeepInfraModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://api.deepinfra.com/v1/openai",
        process.env.DEEPINFRA_API_KEY,
        overrides,
    );
}

export function createOpenRouterModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return {
        provider: "openrouter",
        directEndpoint: "https://openrouter.ai/api/v1/chat/completions",
        responsesEndpoint: "https://openrouter.ai/api/v1/responses",
        authKey: textEnvironmentValue("OPENROUTER_API_KEY"),
        ...overrides,
    };
}

export function createAlibabaModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return {
        provider: "openai",
        directEndpoint:
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
        authKey: process.env.DASHSCOPE_API_KEY,
        ...overrides,
    };
}

export function createVercelAIGatewayModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://ai-gateway.vercel.sh/v1",
        textEnvironmentValue("AI_GATEWAY_API_KEY"),
        {
            responsesEndpoint: "https://ai-gateway.vercel.sh/v1/responses",
            ...overrides,
        },
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
        textEnvironmentValue("OVHCLOUD_API_KEY"),
        overrides,
    );
}

export function createOVHcloudOAIConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
        textEnvironmentValue("OVHCLOUD_API_KEY"),
        overrides,
    );
}
