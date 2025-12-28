import dotenv from "dotenv";
import googleCloudAuth from "../auth/googleCloudAuth.js";
import {
    extractApiVersion,
    extractDeploymentName,
    extractResourceName,
} from "../portkeyUtils.js";

dotenv.config();

/**
 * Creates an Azure model configuration
 * @param {string} apiKey - Azure API key
 * @param {string} endpoint - Azure endpoint
 * @param {string} modelName - Model name to use if not extracted from endpoint
 * @returns {Object} - Azure model configuration
 */
export function createAzureModelConfig(
    apiKey,
    endpoint,
    modelName,
    resourceName = null,
) {
    const deploymentId = extractDeploymentName(endpoint) || modelName;
    return {
        provider: "azure-openai",
        retry: "3",
        "azure-api-key": apiKey,
        "azure-resource-name": resourceName || extractResourceName(endpoint),
        "azure-deployment-id": deploymentId,
        "azure-api-version": extractApiVersion(endpoint),
        "azure-model-name": deploymentId,
        authKey: apiKey, // For Authorization header
    };
}

/**
 * Creates an API Navy model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - API Navy model configuration
 */
export function createApiNavyModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        authKey: process.env.APINAVY_API_KEY,
        "custom-host": process.env.API_NAVY_ENDPOINT,
        ...additionalConfig,
    };
}

/**
 * Creates a DeepSeek model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - DeepSeek model configuration
 */
export function createDeepSeekModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": process.env.AZURE_DEEPSEEK_V3_ENDPOINT,
        authKey: process.env.AZURE_DEEPSEEK_V3_API_KEY,
        "auth-header-name": "Authorization",
        "auth-header-value-prefix": "",
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates a DeepSeek Reasoning model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - DeepSeek Reasoning model configuration
 */
export function createDeepSeekReasoningConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": process.env.AZURE_DEEPSEEK_REASONING_ENDPOINT,
        authKey: process.env.AZURE_DEEPSEEK_REASONING_API_KEY,
        "auth-header-name": "Authorization",
        "auth-header-value-prefix": "",
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates a Myceli DeepSeek V3.1 model configuration (hybrid reasoning/non-reasoning)
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Myceli DeepSeek V3.1 model configuration
 */
export function createMyceliDeepSeekV31Config(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": "https://myceli.services.ai.azure.com/openai/v1",
        authKey: process.env.AZURE_MYCELI_DEEPSEEK_R1_API_KEY,
        model: "DeepSeek-V3.1-2",
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates a Cloudflare model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Cloudflare model configuration
 */
export function createCloudflareModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
        authKey: process.env.CLOUDFLARE_AUTH_TOKEN,
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates a Scaleway model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Scaleway model configuration
 */
export function createScalewayModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": `${process.env.SCALEWAY_BASE_URL || "https://api.scaleway.com/ai-apis/v1"}`,
        authKey: process.env.SCALEWAY_API_KEY,
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates a Mistral model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Mistral model configuration
 */
export function createMistralModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": process.env.SCALEWAY_MISTRAL_BASE_URL,
        authKey: process.env.SCALEWAY_MISTRAL_API_KEY,
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates a Nebius model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Nebius model configuration
 */
export function createNebiusModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": "https://api.studio.nebius.com/v1",
        authKey: process.env.NEBIUS_API_KEY,
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates a Modal model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Modal model configuration
 */
export function createModalModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": "https://pollinations--hormoz-serve.modal.run/v1",
        authKey: process.env.HORMOZ_MODAL_KEY,
        "max-tokens": 4096,
        ...additionalConfig,
    };
}

/**
 * Creates an OpenRouter model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - OpenRouter model configuration
 */
export function createOpenRouterModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": "https://openrouter.ai/api/v1",
        authKey: process.env.OPENROUTER_API_KEY,
        "max-tokens": 4096,
        ...additionalConfig,
    };
}

/**
 * Creates an ElixpoSearch model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - ElixpoSearch model configuration
 */
export function createElixpoSearchModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": process.env.ELIXPOSEARCH_ENDPOINT,
        "max-tokens": 4096,
        ...additionalConfig,
    };
}

/**
 * Creates an Intelligence.io model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Intelligence.io model configuration
 */
export function createIntelligenceModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": "https://api.intelligence.io.solutions/api/v1",
        authKey: process.env.IOINTELLIGENCE_API_KEY,
        "max-tokens": 8192,
        ...additionalConfig,
    };
}

/**
 * Creates an AWS Bedrock Lambda model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - AWS Bedrock Lambda model configuration
 */
export function createBedrockLambdaModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host":
            "https://s4gu3klsuhlqkol3x3qq6bv6em0cwqnu.lambda-url.us-east-1.on.aws/api/v1",
        authKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
        ...additionalConfig,
    };
}

/**
 * Creates AWS Bedrock Fargate model configuration
 * Uses the new Fargate deployment endpoint with ALB
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - AWS Bedrock Fargate model configuration
 */
export function createBedrockFargateModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host":
            "http://bedroc-Proxy-He0yOirTrdQe-378478291.us-east-1.elb.amazonaws.com/api/v1",
        authKey: process.env.AWS_BEARER_TOKEN_BEDROCK_FARGATE,
        ...additionalConfig,
    };
}
