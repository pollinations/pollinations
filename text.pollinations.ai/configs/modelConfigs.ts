import dotenv from "dotenv";
import googleCloudAuth from "../auth/googleCloudAuth.js";
import {
    createAzureModelConfig,
    createScalewayModelConfig,
    createBedrockLambdaModelConfig,
    createBedrockNativeConfig,
    createMyceliDeepSeekV32Config,
    createMyceliGrok4FastConfig,
    createPerplexityModelConfig,
    createOVHcloudModelConfig,
    createFireworksModelConfig,
} from "./providerConfigs.js";

dotenv.config();

// Config keys can be modelIds or custom names - not all modelIds need entries
type PortkeyConfigMap = Record<string, () => unknown>;

// Unified flat Portkey configuration for all providers and models
// Only configs used by public models in availableModels.ts
export const portkeyConfig: PortkeyConfigMap = {
    // ============================================================================
    // Azure (Myceli) - openai, openai-large, openai-audio
    // ============================================================================
    "gpt-5-mini-2025-08-07": () => ({
        ...createAzureModelConfig(
            process.env.AZURE_MYCELI_GPT5MINI_API_KEY,
            process.env.AZURE_MYCELI_GPT5MINI_ENDPOINT,
            "gpt-5-mini-2025-08-07",
        ),
        "max-completion-tokens": 1024,
    }),
    "gpt-5.2-2025-12-11": () => ({
        ...createAzureModelConfig(
            process.env.AZURE_MYCELI_GPT52_API_KEY,
            process.env.AZURE_MYCELI_GPT52_ENDPOINT,
            "gpt-5.2-2025-12-11",
        ),
        "max-completion-tokens": 16384,
    }),
    "gpt-4o-mini-audio-preview-2024-12-17": () => ({
        ...createAzureModelConfig(
            process.env.AZURE_MYCELI_GPT4O_AUDIO_API_KEY,
            process.env.AZURE_MYCELI_GPT4O_AUDIO_ENDPOINT,
            "gpt-4o-mini-audio-preview-2024-12-17",
        ),
        "max-completion-tokens": 2048,
    }),
    "myceli-deepseek-v3.2": () => createMyceliDeepSeekV32Config(),
    "myceli-grok-4-fast": () => createMyceliGrok4FastConfig(),

    // ============================================================================
    // Azure-2 (PointsFlyer) - openai-fast, midijourney
    // ============================================================================
    "gpt-5-nano-2025-08-07": () => ({
        ...createAzureModelConfig(
            process.env.AZURE_PF_GPT5NANO_API_KEY,
            process.env.AZURE_PF_GPT5NANO_ENDPOINT,
            "gpt-5-nano-2025-08-07",
        ),
        "max-completion-tokens": 512,
    }),
    "gpt-4.1-2025-04-14": () => ({
        ...createAzureModelConfig(
            process.env.AZURE_PF_GPT41_API_KEY,
            process.env.AZURE_PF_GPT41_ENDPOINT,
            "gpt-4.1-2025-04-14",
        ),
        "max-tokens": 512,
        "max-completion-tokens": 512,
    }),

    // ============================================================================
    // Scaleway - mistral, qwen-coder
    // ============================================================================
    "mistral-small-3.2-24b-instruct-2506": () =>
        createScalewayModelConfig({
            "max-tokens": 8192,
            model: "mistral-small-3.2-24b-instruct-2506",
        }),
    "qwen2.5-coder-32b-instruct": () =>
        createScalewayModelConfig({
            "max-tokens": 8000,
            model: "qwen2.5-coder-32b-instruct",
        }),

    // ============================================================================
    // AWS Bedrock - claude-fast, claude, claude-large, chickytutor, nova-fast
    // ============================================================================
    "us.anthropic.claude-3-5-haiku-20241022-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
        }),
    "us.anthropic.claude-haiku-4-5-20251001-v1:0": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        }),
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        }),
    "global.anthropic.claude-opus-4-5-20251101-v1:0": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-opus-4-5-20251101-v1:0",
        }),

    // ============================================================================
    // Google Vertex AI - Claude models (alternative to Bedrock)
    // ============================================================================
    "claude-opus-4-5-vertex": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GOOGLE_PROJECT_ID,
        "vertex-region": "europe-west1",
        "vertex-model-id": "anthropic.claude-opus-4-5@20251101",
        "strict-open-ai-compliance": "true",
        defaultOptions: { max_tokens: 64000 },
    }),
    "claude-sonnet-4-5-vertex": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GOOGLE_PROJECT_ID,
        "vertex-region": "europe-west1",
        "vertex-model-id": "anthropic.claude-sonnet-4-5@20250929",
        "strict-open-ai-compliance": "true",
        defaultOptions: { max_tokens: 64000 },
    }),
    "amazon.nova-micro-v1:0": () =>
        createBedrockLambdaModelConfig({
            model: "amazon.nova-micro-v1:0",
        }),

    // ============================================================================
    // Google Vertex AI - gemini, gemini-fast, gemini-large, gemini-search, kimi-k2-thinking
    // ============================================================================
    "gemini-3-flash-preview": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GOOGLE_PROJECT_ID,
        "vertex-region": "global",
        "vertex-model-id": "gemini-3-flash-preview",
        "strict-openai-compliance": "false",
    }),
    "gemini-2.5-flash-lite": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GOOGLE_PROJECT_ID,
        "vertex-region": "us-central1",
        "vertex-model-id": "gemini-2.5-flash-lite",
        "strict-openai-compliance": "false",
    }),
    "gemini-3-pro-preview": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GOOGLE_PROJECT_ID,
        "vertex-region": "global",
        "vertex-model-id": "gemini-3-pro-preview",
        "strict-openai-compliance": "false",
    }),
    "kimi-k2-thinking-maas": () => ({
        provider: "openai",
        authKey: googleCloudAuth.getAccessToken,
        "custom-host": `https://aiplatform.googleapis.com/v1/projects/${process.env.GOOGLE_PROJECT_ID}/locations/global/endpoints/openapi`,
        "strict-openai-compliance": "false",
        model: "moonshotai/kimi-k2-thinking-maas",
    }),

    // ============================================================================
    // Perplexity - perplexity-fast, perplexity-reasoning
    // ============================================================================
    "sonar": () =>
        createPerplexityModelConfig({
            model: "sonar",
        }),
    "sonar-reasoning": () =>
        createPerplexityModelConfig({
            model: "sonar-reasoning",
        }),
    "sonar-reasoning-pro": () =>
        createPerplexityModelConfig({
            model: "sonar-reasoning-pro",
        }),

    // ============================================================================
    // OVHcloud AI Endpoints - qwen3-coder
    // ============================================================================
    "qwen3-coder-30b-a3b-instruct": () =>
        createOVHcloudModelConfig({
            model: "Qwen3-Coder-30B-A3B-Instruct",
        }),

    // ============================================================================
    // Fireworks AI - glm-4.7, minimax-m2.1
    // ============================================================================
    "accounts/fireworks/models/glm-4p7": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/glm-4p7",
            "max-tokens": 25344,
        }),
    "accounts/fireworks/models/minimax-m2p1": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/minimax-m2p1",
            "max-tokens": 25600,
        }),
};
