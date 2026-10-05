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
        // Non-OpenAI Azure deployments reject stream_options; OpenAI entries opt in.
        supportsStreamOptions: false,
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
        requiresBase64ImageUrls: true,
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

export function createMistralModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://api.mistral.ai/v1",
        textEnvironmentValue("MISTRAL_API_KEY"),
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

/**
 * Perplexity's Agent API takes Responses requests. Its models search only
 * when given the web_search tool (and skip it for simple questions unless
 * required), and cite inline only when asked to; the cited numbers are the IDs
 * of the returned search results.
 */
export function createPerplexityAgentConfig(
    model: string,
    webSearch: unknown = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://api.perplexity.ai",
        textEnvironmentValue("PERPLEXITY_API_KEY"),
        {
            model,
            responsesEndpoint: "https://api.perplexity.ai/v1/agent",
            responsesDefaults: {
                instructions:
                    "Cite sources inline with bracketed numbers that match the search result IDs, like [1][2].",
                tools: [
                    {
                        type: "web_search",
                        ...(webSearch as Record<string, unknown>),
                    },
                ],
                tool_choice: "required",
            },
        },
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
