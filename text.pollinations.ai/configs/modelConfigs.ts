import dotenv from "dotenv";
import debug from "debug";
import googleCloudAuth from "../auth/googleCloudAuth.js";
import {
    createAzureModelConfig,
    createCloudflareModelConfig,
    createScalewayModelConfig,
    createMistralModelConfig,
    createNebiusModelConfig,
    createModalModelConfig,
    createOpenRouterModelConfig,
    createElixpoSearchModelConfig,
    createIntelligenceModelConfig,
    createBedrockLambdaModelConfig,
    createBedrockNativeConfig,
    createDeepSeekModelConfig,
    createDeepSeekReasoningConfig,
    createMyceliDeepSeekV31Config,
    createMyceliGrok4FastConfig,
    createApiNavyModelConfig,
    createPerplexityModelConfig,
} from "./providerConfigs.js";
import type { ModelId } from "../../shared/registry/registry.js";

const log = debug("pollinations:portkey");

dotenv.config();

// Type-safe config object: all keys must be valid model IDs from MODEL_REGISTRY
type PortkeyConfigMap = {
    [K in ModelId]: () => any;
} & {
    [key: string]: () => any; // Allow additional legacy configs not in MODEL_REGISTRY
};

// Unified flat Portkey configuration for all providers and models - using functions that return fresh configurations
export const portkeyConfig: PortkeyConfigMap = {
    // ============================================================================
    // ACTIVE CONFIGS - Used in availableModels.ts
    // ============================================================================

    // Azure OpenAI model configurations
    "gpt-5-mini-2025-08-07": () => ({
        ...createAzureModelConfig(
            process.env.AZURE_MYCELI_GPT5MINI_API_KEY,
            process.env.AZURE_MYCELI_GPT5MINI_ENDPOINT,
            "gpt-5-mini-2025-08-07",
        ),
        "max-completion-tokens": 1024,
    }),
    "gpt-5-nano-2025-08-07": () => ({
        ...createAzureModelConfig(
            process.env.AZURE_OPENAI_NANO_5_API_KEY,
            process.env.AZURE_OPENAI_NANO_5_ENDPOINT,
            "gpt-5-nano-2025-08-07",
        ),
        "max-completion-tokens": 512,
    }),
    "gpt-4.1-nano-2025-04-14": () =>
        createAzureModelConfig(
            process.env.AZURE_OPENAI_NANO_API_KEY,
            process.env.AZURE_OPENAI_NANO_ENDPOINT,
            "gpt-4.1-nano-2025-04-14",
        ),
    "gpt-5-chat-latest": () => ({
        ...createAzureModelConfig(
            process.env.AZURE_MYCELI_GPT5CHAT_API_KEY,
            process.env.AZURE_MYCELI_GPT5CHAT_ENDPOINT,
            "gpt-5-chat-latest",
        ),
        "max-completion-tokens": 768,
    }),
    "gpt-4.1-2025-04-14": () => ({
        ...createAzureModelConfig(
            process.env.AZURE_OPENAI_41_API_KEY,
            process.env.AZURE_OPENAI_41_ENDPOINT,
            "gpt-4.1-2025-04-14",
        ),
        "max-tokens": 512,
        "max-completion-tokens": 512,
    }),
    "gpt-4o-mini-audio-preview-2024-12-17": () => ({
        ...createAzureModelConfig(
            process.env.AZURE_OPENAI_AUDIO_API_KEY,
            process.env.AZURE_OPENAI_AUDIO_ENDPOINT,
            "gpt-4o-mini-audio-preview-2024-12-17",
        ),
        "max-completion-tokens": 2048,
    }),
    "openai/o4-mini": () =>
        createAzureModelConfig(
            process.env.AZURE_O4MINI_API_KEY,
            process.env.AZURE_O4MINI_ENDPOINT,
            "openai/o4-mini",
        ),
    "mistral-small-3.1-24b-instruct-2503": () =>
        createScalewayModelConfig({
            "max-tokens": 8192,
            model: "mistral-small-3.1-24b-instruct-2503",
        }),
    "mistral-small-3.2-24b-instruct-2506": () =>
        createScalewayModelConfig({
            "max-tokens": 8192,
            model: "mistral-small-3.2-24b-instruct-2506",
        }),

    // AWS Bedrock Lambda configurations
    "mistral.mistral-small-2402-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "mistral.mistral-small-2402-v1:0",
        }),
    "us.deepseek.r1-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "us.deepseek.r1-v1:0",
            "max-tokens": 2000,
        }),
    "amazon.nova-micro-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "amazon.nova-micro-v1:0",
        }),
    "us.meta.llama3-1-8b-instruct-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "us.meta.llama3-1-8b-instruct-v1:0",
            "max-tokens": 4096, // Llama 3.1 8B has 8192 limit
        }),
    "us.anthropic.claude-3-5-haiku-20241022-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
        }),
    "global.anthropic.claude-haiku-4-5-20251001-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
        }),
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        }),
    "us.anthropic.claude-sonnet-4-20250514-v1:0": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-sonnet-4-20250514-v1:0",
        }),
    "us.anthropic.claude-opus-4-20250514-v1:0": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-opus-4-20250514-v1:0",
        }),
    "us.anthropic.claude-haiku-4-5-20251001-v1:0": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        }),
    "global.anthropic.claude-opus-4-5-20251101-v1:0": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-opus-4-5-20251101-v1:0",
        }),

    // Google Vertex AI configurations
    "gemini-2.5-flash-lite": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GCLOUD_PROJECT_ID,
        "vertex-region": "us-central1",
        "vertex-model-id": "gemini-2.5-flash-lite",
        "strict-openai-compliance": "false",
    }),
    "gemini-3-pro-preview": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GCLOUD_PROJECT_ID,
        "vertex-region": "global",
        "vertex-model-id": "gemini-3-pro-preview",
        "strict-openai-compliance": "false",
    }),
    "kimi-k2-thinking-maas": () => ({
        provider: "openai",
        authKey: googleCloudAuth.getAccessToken,
        "custom-host": `https://aiplatform.googleapis.com/v1/projects/${process.env.GCLOUD_PROJECT_ID}/locations/global/endpoints/openapi`,
        "strict-openai-compliance": "false",
        model: "moonshotai/kimi-k2-thinking-maas",
    }),
    // Note: gemini-search service uses same config as gemini, just adds Google Search transform
    "deepseek-ai/deepseek-v3.1-maas": () => ({
        provider: "openai",
        authKey: googleCloudAuth.getAccessToken,
        "custom-host": `https://us-west2-aiplatform.googleapis.com/v1/projects/${process.env.GCLOUD_PROJECT_ID}/locations/us-west2/endpoints/openapi`,
        "strict-openai-compliance": "false",
        model: "deepseek-ai/deepseek-v3.1-maas",
    }),

    // ============================================================================
    // LEGACY/UNUSED CONFIGS - Not currently referenced in availableModels.ts
    // ============================================================================

    // Azure model configurations
    "azure-grok": () =>
        createAzureModelConfig(
            process.env.AZURE_GENERAL_API_KEY,
            process.env.AZURE_GENERAL_ENDPOINT,
            `grok-3-mini`,
            "pollinations-safety",
        ),
    "gpt-4.1-mini": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_GPT41MINI_API_KEY,
            process.env.AZURE_MYCELI_GPT41MINI_ENDPOINT,
            "gpt-4.1-mini",
        ),
    "azure-gpt-5": () =>
        createAzureModelConfig(
            process.env.AZURE_OPENAI_GPT_5_API_KEY,
            process.env.AZURE_OPENAI_GPT_5_ENDPOINT,
            "gpt-5",
        ),
    "gpt-4.1-nano-roblox": () => {
        // Randomly select one of the 4 roblox endpoints
        const endpoints = [
            {
                apiKey: process.env.AZURE_OPENAI_ROBLOX_API_KEY_1,
                endpoint: process.env.AZURE_OPENAI_ROBLOX_ENDPOINT_1,
            },
            {
                apiKey: process.env.AZURE_OPENAI_ROBLOX_API_KEY_2,
                endpoint: process.env.AZURE_OPENAI_ROBLOX_ENDPOINT_2,
            },
            {
                apiKey: process.env.AZURE_OPENAI_ROBLOX_API_KEY_3,
                endpoint: process.env.AZURE_OPENAI_ROBLOX_ENDPOINT_3,
            },
            {
                apiKey: process.env.AZURE_OPENAI_ROBLOX_API_KEY_4,
                endpoint: process.env.AZURE_OPENAI_ROBLOX_ENDPOINT_4,
            },
        ];

        const randomIndex = Math.floor(Math.random() * endpoints.length);
        const selectedEndpoint = endpoints[randomIndex];

        log(
            `Selected random roblox endpoint ${randomIndex + 1}: ${selectedEndpoint.endpoint}`,
        );

        return createAzureModelConfig(
            selectedEndpoint.apiKey,
            selectedEndpoint.endpoint,
            "gpt-4.1-nano",
        );
    },
    "gpt-4o-mini": () => {
        // Randomly select one of the 2 endpoints
        const endpoints = [
            {
                apiKey: process.env.AZURE_OPENAI_MINI_API_KEY_1,
                endpoint: process.env.AZURE_OPENAI_MINI_ENDPOINT_1,
            },
            {
                apiKey: process.env.AZURE_OPENAI_MINI_API_KEY_2,
                endpoint: process.env.AZURE_OPENAI_MINI_ENDPOINT_2,
            },
        ];

        const randomIndex = Math.floor(Math.random() * endpoints.length);
        const selectedEndpoint = endpoints[randomIndex];

        log(
            `Selected random endpoint ${randomIndex + 1}: ${selectedEndpoint.endpoint}`,
        );

        return createAzureModelConfig(
            selectedEndpoint.apiKey,
            selectedEndpoint.endpoint,
            "gpt-4o-mini",
        );
    },
    "gpt-4o": () =>
        createAzureModelConfig(
            process.env.AZURE_OPENAI_LARGE_API_KEY,
            process.env.AZURE_OPENAI_LARGE_ENDPOINT,
            "gpt-4o",
        ),
    "o1-mini": () =>
        createAzureModelConfig(
            process.env.AZURE_O1MINI_API_KEY,
            process.env.AZURE_O1MINI_ENDPOINT,
            "o1-mini",
        ),
    "gpt-4o-audio-preview": () =>
        createAzureModelConfig(
            process.env.AZURE_OPENAI_AUDIO_LARGE_API_KEY,
            process.env.AZURE_OPENAI_AUDIO_LARGE_ENDPOINT,
            "gpt-4o-audio-preview",
        ),
    "azure-gpt-4.1-xlarge": () =>
        createAzureModelConfig(
            process.env.AZURE_OPENAI_XLARGE_API_KEY,
            process.env.AZURE_OPENAI_XLARGE_ENDPOINT,
            "gpt-4.1",
        ),
    "Cohere-command-r-plus-08-2024-jt": () => ({
        provider: "openai",
        "custom-host": process.env.AZURE_COMMAND_R_ENDPOINT,
        authKey: process.env.AZURE_COMMAND_R_API_KEY,
        "auth-header-name": "Authorization",
        "auth-header-value-prefix": "",
        "max-tokens": 800,
    }),
    // Cloudflare model configurations
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast": () =>
        createCloudflareModelConfig(),
    "@cf/meta/llama-3.1-8b-instruct": () => createCloudflareModelConfig(),
    "@cf/meta/llama-3.1-8b-instruct-fp8": () => createCloudflareModelConfig(),
    "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b": () =>
        createCloudflareModelConfig(),
    "@cf/mistralai/mistral-small-3.1-24b-instruct": () =>
        createCloudflareModelConfig({
            "max-tokens": 8192,
            model: "@cf/mistralai/mistral-small-3.1-24b-instruct",
        }),
    "@hf/thebloke/llamaguard-7b-awq": () => ({
        ...createCloudflareModelConfig(),
        "max-tokens": 4000,
    }),
    "phi-4-instruct": () => ({
        provider: "openai",
        "custom-host": process.env.OPENAI_PHI4_ENDPOINT,
        authKey: process.env.OPENAI_PHI4_API_KEY,
    }),
    "phi-4-mini-instruct": () => ({
        provider: "openai",
        "custom-host": process.env.OPENAI_PHI4_MINI_ENDPOINT,
        authKey: process.env.OPENAI_PHI4_MINI_API_KEY,
    }),
    "@cf/meta/llama-3.2-11b-vision-instruct": () =>
        createCloudflareModelConfig(),
    "@cf/meta/llama-4-scout-17b-16e-instruct": () => ({
        ...createCloudflareModelConfig(),
        "max-tokens": 4096, // Reduced from 8192 to avoid context length errors
    }),
    // Scaleway model configurations
    "qwen3-235b-a22b-instruct-2507": () => createScalewayModelConfig(),
    "qwen2.5-coder-32b-instruct": () =>
        createScalewayModelConfig({
            "max-tokens": 8000, // Set specific token limit for Qwen Coder
            model: "qwen2.5-coder-32b-instruct",
        }),
    "llama-3.1-8b-instruct": () =>
        createScalewayModelConfig({
            model: "llama-3.1-8b-instruct",
        }),
    "mistral-nemo-instruct-2407": () =>
        createScalewayModelConfig({
            model: "mistral-nemo-instruct-2407",
        }),
    "llama-3.3-70b-instruct": () => createScalewayModelConfig(),
    surscaleway: () => createScalewayModelConfig(),
    "qwen-reasoning": () => createScalewayModelConfig(),
    "openai-reasoning": () => createApiNavyModelConfig(),
    "o4-mini": () => createApiNavyModelConfig(),
    searchgpt: () => createApiNavyModelConfig(),
    "gpt-4o-mini-search-preview": () => createApiNavyModelConfig(),
    unity: () => createScalewayModelConfig(),
    "mis-unity": () => createScalewayModelConfig(),
    // Nebius model configurations
    "mistralai/Mistral-Nemo-Instruct-2407": () =>
        createNebiusModelConfig({
            model: "mistralai/Mistral-Nemo-Instruct-2407",
        }),
    "meta-llama/Meta-Llama-3.1-8B-Instruct-fast": () =>
        createNebiusModelConfig({
            model: "meta-llama/Meta-Llama-3.1-8B-Instruct-fast",
        }),
    "deepseek-ai/DeepSeek-R1-0528": () =>
        createNebiusModelConfig({
            model: "deepseek-ai/DeepSeek-R1-0528",
            "max-tokens": 2000,
        }),
    "google/gemma-2-9b-it-fast": () =>
        createNebiusModelConfig({
            model: "google/gemma-2-9b-it-fast",
            "max-tokens": 1024,
        }),
    // Intelligence.io model configurations
    "THUDM/glm-4-9b-chat": () =>
        createIntelligenceModelConfig({
            model: "THUDM/glm-4-9b-chat",
        }),
    // Modal model configurations
    "Hormoz-8B": () => createModalModelConfig(),
    // OpenRouter model configurations
    "anthropic/claude-3.5-haiku-20241022": () =>
        createOpenRouterModelConfig({
            "http-referer": "https://pollinations.ai",
            "x-title": "Pollinations.AI",
        }),
    // Cloudflare models
    "@cf/qwen/qwq-32b": () =>
        createCloudflareModelConfig({
            "http-referer": "https://pollinations.ai",
            "x-title": "Pollinations.AI",
        }),
    // Google Vertex AI model configurations
    "gemini-2.5-flash-vertex": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken, // Fix: use getAccessToken instead of getToken
        "vertex-project-id": process.env.GCLOUD_PROJECT_ID,
        "vertex-region": "us-central1",
        "vertex-model-id": "gemini-2.5-flash",
        "strict-openai-compliance": "false",
    }),
    "gemini-2.5-pro-exp-03-25": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GCLOUD_PROJECT_ID,
        "vertex-region": "us-central1",
        "vertex-model-id": "gemini-2.5-pro-exp-03-25",
        "strict-openai-compliance": "false",
    }),
    "gemini-2.0-flash-thinking": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GCLOUD_PROJECT_ID,
        "vertex-region": "us-central1",
        "vertex-model-id": "gemini-2.0-flash-thinking",
        "strict-openai-compliance": "false",
    }),
    "deepseek-ai/deepseek-r1-0528-maas": () => ({
        provider: "openai",
        authKey: googleCloudAuth.getAccessToken,
        "custom-host": `https://us-central1-aiplatform.googleapis.com/v1/projects/${process.env.GCLOUD_PROJECT_ID}/locations/us-central1/endpoints/openapi`,
        "strict-openai-compliance": "false",
    }),
    "DeepSeek-V3-0324": () => createDeepSeekModelConfig(),
    "MAI-DS-R1": () => createDeepSeekReasoningConfig(),
    "myceli-deepseek-v3.1": () => createMyceliDeepSeekV31Config(),
    "myceli-grok-4-fast": () => createMyceliGrok4FastConfig(),
    // Custom endpoints
    "elixposearch-endpoint": () => createElixpoSearchModelConfig(),
    // AWS Bedrock Lambda endpoint
    "eu.anthropic.claude-sonnet-4-20250514-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "eu.anthropic.claude-sonnet-4-20250514-v1:0",
        }),
    "meta.llama3-1-8b-instruct-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "meta.llama3-1-8b-instruct-v1:0",
        }),
    "us.meta.llama3-2-1b-instruct-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "us.meta.llama3-2-1b-instruct-v1:0",
        }),
    "us.meta.llama3-2-3b-instruct-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "us.meta.llama3-2-3b-instruct-v1:0",
        }),
    "sonar": () =>
        createPerplexityModelConfig({
            model: "sonar",
        }),
    "sonar-reasoning": () =>
        createPerplexityModelConfig({
            model: "sonar-reasoning",
        }),
};
