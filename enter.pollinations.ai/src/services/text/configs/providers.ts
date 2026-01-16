/**
 * Provider configuration factory functions for different LLM providers.
 * These create Portkey-compatible configuration objects.
 */

export interface ProviderConfig {
    provider: string;
    authKey?: string | (() => string | Promise<string>);
    model?: string;
    "custom-host"?: string;
    "azure-api-key"?: string;
    "azure-resource-name"?: string;
    "azure-deployment-id"?: string;
    "azure-api-version"?: string;
    "azure-model-name"?: string;
    "aws-access-key-id"?: string;
    "aws-secret-access-key"?: string;
    "aws-region"?: string;
    "vertex-project-id"?: string;
    "vertex-region"?: string;
    "vertex-model-id"?: string;
    "strict-openai-compliance"?: string;
    "strict-open-ai-compliance"?: string;
    "max-tokens"?: number;
    "max-completion-tokens"?: number;
    defaultOptions?: Record<string, unknown>;
    [key: string]: unknown;
}

/**
 * Extract resource name from Azure endpoint URL
 */
export function extractResourceName(
    endpoint: string | undefined | null,
): string | null {
    if (endpoint === undefined || endpoint === null) return null;

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

    // If we can't extract the resource name, use a default value
    if (!result || result === "undefined") {
        return "pollinations";
    }

    return result;
}

/**
 * Extract deployment name from Azure endpoint URL
 */
export function extractDeploymentName(
    endpoint: string | undefined | null,
): string | null {
    if (!endpoint) return null;

    // Extract deployment name (e.g., gpt-4o-mini from .../deployments/gpt-4o-mini/...)
    const match = endpoint.match(/\/deployments\/([^/]+)/);
    return match ? match[1] : null;
}

/**
 * Extract API version from Azure endpoint URL
 */
export function extractApiVersion(endpoint: string | undefined | null): string {
    if (!endpoint) return "2024-08-01-preview";

    // Extract API version (e.g., 2024-08-01-preview from ...?api-version=2024-08-01-preview)
    const match = endpoint.match(/api-version=([^&]+)/);
    return match ? match[1] : "2024-08-01-preview";
}

/**
 * Creates an Azure model configuration
 */
export function createAzureModelConfig(
    apiKey: string | undefined,
    endpoint: string | undefined,
    modelName: string,
    resourceName: string | null = null,
): ProviderConfig {
    const deploymentId = extractDeploymentName(endpoint) || modelName;
    return {
        provider: "azure-openai",
        "azure-api-key": apiKey,
        "azure-resource-name":
            resourceName || extractResourceName(endpoint) || undefined,
        "azure-deployment-id": deploymentId,
        "azure-api-version": extractApiVersion(endpoint),
        "azure-model-name": deploymentId,
        authKey: apiKey,
    };
}

/**
 * Creates a Scaleway model configuration
 */
export function createScalewayModelConfig(
    env: { SCALEWAY_BASE_URL?: string; SCALEWAY_API_KEY?: string },
    additionalConfig: Partial<ProviderConfig> = {},
): ProviderConfig {
    return {
        provider: "openai",
        "custom-host":
            env.SCALEWAY_BASE_URL || "https://api.scaleway.com/ai-apis/v1",
        authKey: env.SCALEWAY_API_KEY,
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates an AWS Bedrock Lambda model configuration
 */
export function createBedrockLambdaModelConfig(
    env: { AWS_BEARER_TOKEN_BEDROCK?: string },
    additionalConfig: Partial<ProviderConfig> = {},
): ProviderConfig {
    return {
        provider: "openai",
        "custom-host":
            "https://s4gu3klsuhlqkol3x3qq6bv6em0cwqnu.lambda-url.us-east-1.on.aws/api/v1",
        authKey: env.AWS_BEARER_TOKEN_BEDROCK,
        defaultOptions: { max_tokens: 8192 },
        ...additionalConfig,
    };
}

/**
 * Creates native AWS Bedrock model configuration via Portkey
 */
export function createBedrockNativeConfig(
    env: {
        AWS_ACCESS_KEY_ID?: string;
        AWS_SECRET_ACCESS_KEY?: string;
        AWS_REGION?: string;
    },
    additionalConfig: Partial<ProviderConfig> = {},
): ProviderConfig {
    return {
        provider: "bedrock",
        "aws-access-key-id": env.AWS_ACCESS_KEY_ID,
        "aws-secret-access-key": env.AWS_SECRET_ACCESS_KEY,
        "aws-region": env.AWS_REGION || "us-east-1",
        defaultOptions: { max_tokens: 8192 },
        ...additionalConfig,
    };
}

/**
 * Creates a Myceli Grok 4 Fast model configuration
 */
export function createMyceliGrok4FastConfig(
    env: { AZURE_MYCELI_DEEPSEEK_R1_API_KEY?: string },
    additionalConfig: Partial<ProviderConfig> = {},
): ProviderConfig {
    return {
        provider: "openai",
        "custom-host": "https://myceli.services.ai.azure.com/openai/v1",
        authKey: env.AZURE_MYCELI_DEEPSEEK_R1_API_KEY,
        model: "grok-4-fast-non-reasoning",
        ...additionalConfig,
    };
}

/**
 * Creates a Perplexity model configuration
 */
export function createPerplexityModelConfig(
    env: { PERPLEXITY_API_KEY?: string },
    additionalConfig: Partial<ProviderConfig> = {},
): ProviderConfig {
    return {
        provider: "perplexity-ai",
        authKey: env.PERPLEXITY_API_KEY,
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates an OVHcloud AI Endpoints model configuration
 */
export function createOVHcloudModelConfig(
    env: { OVHCLOUD_API_KEY?: string },
    additionalConfig: Partial<ProviderConfig> = {},
): ProviderConfig {
    return {
        provider: "openai",
        "custom-host":
            "https://qwen-3-coder-30b-a3b-instruct.endpoints.kepler.ai.cloud.ovh.net/api/openai_compat/v1",
        authKey: env.OVHCLOUD_API_KEY,
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates a Fireworks AI model configuration
 */
export function createFireworksModelConfig(
    env: { FIREWORKS_API_KEY?: string },
    additionalConfig: Partial<ProviderConfig> = {},
): ProviderConfig {
    return {
        provider: "openai",
        "custom-host": "https://api.fireworks.ai/inference/v1",
        authKey: env.FIREWORKS_API_KEY,
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates a Google Vertex AI model configuration
 */
export function createVertexAIModelConfig(
    env: { GOOGLE_PROJECT_ID?: string },
    getAccessToken: () => string | Promise<string>,
    additionalConfig: Partial<ProviderConfig> = {},
): ProviderConfig {
    return {
        provider: "vertex-ai",
        authKey: getAccessToken,
        "vertex-project-id": env.GOOGLE_PROJECT_ID,
        ...additionalConfig,
    };
}
