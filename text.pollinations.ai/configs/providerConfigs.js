import dotenv from "dotenv";
import {
    extractApiVersion,
    extractDeploymentName,
    extractResourceName,
} from "../portkeyUtils.js";

dotenv.config();

// =============================================================================
// ACTIVE PROVIDER FACTORIES - Used by public models in availableModels.ts
// =============================================================================

/**
 * Creates an Azure model configuration
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
        "azure-api-key": apiKey,
        "azure-resource-name": resourceName || extractResourceName(endpoint),
        "azure-deployment-id": deploymentId,
        "azure-api-version": extractApiVersion(endpoint),
        "azure-model-name": deploymentId,
        authKey: apiKey,
    };
}

/**
 * Creates a Scaleway model configuration
 */
export function createScalewayModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": `${process.env.SCALEWAY_BASE_URL || "https://api.scaleway.com/ai-apis/v1"}`,
        authKey: process.env.SCALEWAY_API_KEY,
        ...additionalConfig,
    };
}

/**
 * Creates native AWS Bedrock model configuration via Portkey
 */
export function createBedrockNativeConfig(additionalConfig = {}) {
    return {
        provider: "bedrock",
        "aws-access-key-id": process.env.AWS_ACCESS_KEY_ID,
        "aws-secret-access-key": process.env.AWS_SECRET_ACCESS_KEY,
        "aws-region": process.env.AWS_REGION || "us-east-1",
        ...additionalConfig,
    };
}

/**
 * Creates a Myceli DeepSeek V3.2 model configuration
 */
export function createMyceliDeepSeekV32Config(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": "https://myceli.services.ai.azure.com/openai/v1",
        authKey: process.env.AZURE_MYCELI_DEEPSEEK_R1_API_KEY,
        model: "DeepSeek-V3.2",
        ...additionalConfig,
    };
}

/**
 * Creates a Myceli Grok 4 Fast model configuration
 */
export function createMyceliGrok4FastConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": "https://myceli.services.ai.azure.com/openai/v1",
        authKey: process.env.AZURE_MYCELI_DEEPSEEK_R1_API_KEY,
        model: "grok-4-fast-non-reasoning",
        ...additionalConfig,
    };
}

/**
 * Creates a Perplexity model configuration
 */
export function createPerplexityModelConfig(additionalConfig = {}) {
    return {
        provider: "perplexity-ai",
        authKey: process.env.PERPLEXITY_API_KEY,
        ...additionalConfig,
    };
}

/**
 * Creates an OVHcloud AI Endpoints model configuration
 */
export function createOVHcloudModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host":
            "https://qwen-3-coder-30b-a3b-instruct.endpoints.kepler.ai.cloud.ovh.net/api/openai_compat/v1",
        authKey: process.env.OVHCLOUD_API_KEY,
        ...additionalConfig,
    };
}

/**
 * Creates a Fireworks AI model configuration
 */
export function createFireworksModelConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": "https://api.fireworks.ai/inference/v1",
        authKey: process.env.FIREWORKS_API_KEY,
        ...additionalConfig,
    };
}

/**
 * Creates a NomNom model configuration (community model with web search/scrape/crawl)
 * Uses user's API key for billing passthrough - NomNom calls Pollinations internally
 */
export function createNomNomConfig(additionalConfig = {}) {
    return {
        provider: "openai",
        "custom-host": "https://scrape.pollinations.ai/v1",
        // Flag to use user's API key from x-user-api-key header for billing passthrough
        useUserApiKey: true,
        ...additionalConfig,
    };
}
