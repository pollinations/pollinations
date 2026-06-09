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
    return (
        endpoint.match(
            /https:\/\/([^.]+)\.(?:openai|cognitiveservices)\.azure\.com/,
        )?.[1] ?? "pollinations"
    );
}

function extractAzureDeploymentName(
    endpoint: string | undefined,
): string | null {
    if (!endpoint) return null;
    return endpoint.match(/\/deployments\/([^/]+)/)?.[1] ?? null;
}

function extractAzureApiVersion(endpoint: string | undefined): string {
    return endpoint?.match(/api-version=([^&]+)/)?.[1] ?? "2024-08-01-preview";
}

// =============================================================================
// Provider Factories
// =============================================================================

export function createAzureModelConfig(
    apiKey: string | undefined,
    endpoint: string | undefined,
    modelName: string,
    overrides: ModelOverride = {},
): ProviderConfig {
    const deploymentId = extractAzureDeploymentName(endpoint) || modelName;
    return {
        provider: "azure-openai",
        "azure-api-key": apiKey,
        "azure-resource-name": extractAzureResourceName(endpoint),
        "azure-deployment-id": deploymentId,
        "azure-api-version": extractAzureApiVersion(endpoint),
        "azure-model-name": deploymentId,
        authKey: apiKey,
        ...overrides,
    };
}

/**
 * Which AWS account's Bedrock credentials to use.
 * - "default": original Pollinations account (301235909293) — all Bedrock models.
 * - "myceli":  new Myceli org prod account (514585225061). Opt models in here as
 *              their Bedrock quota on that account is raised enough to serve them.
 *              No fallback: if these creds are missing the call fails loudly, so a
 *              misrouted model is visible instead of silently served from the old account.
 */
type BedrockAccount = "default" | "myceli";

function bedrockCredentials(
    account: BedrockAccount,
): Pick<
    ProviderConfig,
    "aws-access-key-id" | "aws-secret-access-key" | "aws-region"
> {
    if (account === "myceli") {
        return {
            "aws-access-key-id": process.env.AWS_BEDROCK_MYCELI_ACCESS_KEY_ID,
            "aws-secret-access-key":
                process.env.AWS_BEDROCK_MYCELI_SECRET_ACCESS_KEY,
            "aws-region": process.env.AWS_BEDROCK_MYCELI_REGION || "us-east-1",
        };
    }
    return {
        "aws-access-key-id": process.env.AWS_ACCESS_KEY_ID,
        "aws-secret-access-key": process.env.AWS_SECRET_ACCESS_KEY,
        "aws-region": process.env.AWS_REGION || "us-east-1",
    };
}

export function createBedrockNativeConfig(
    overrides: ModelOverride = {},
    account: BedrockAccount = "default",
): ProviderConfig {
    return {
        provider: "bedrock",
        ...bedrockCredentials(account),
        ...overrides,
    };
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
    return createOpenAICompatibleConfig(
        "https://openrouter.ai/api/v1",
        process.env.OPENROUTER_API_KEY,
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

export function createDashScopeModelConfig(
    overrides: ModelOverride = {},
): ProviderConfig {
    return createOpenAICompatibleConfig(
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        process.env.DASHSCOPE_API_KEY,
        overrides,
    );
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
