import dotenv from "dotenv";
import googleCloudAuth from "../auth/googleCloudAuth.js";
import {
    createAzureModelConfig,
    createBedrockLambdaModelConfig,
    createBedrockNativeConfig,
    createFireworksModelConfig,
    createMyceliGrok4FastConfig,
    createNomNomConfig,
    createOVHcloudModelConfig,
    createPerplexityModelConfig,
    createScalewayModelConfig,
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
    "deepseek-v3.2-maas": () => ({
        provider: "openai",
        authKey: googleCloudAuth.getAccessToken,
        "custom-host": `https://aiplatform.googleapis.com/v1/projects/${process.env.GOOGLE_PROJECT_ID}/locations/global/endpoints/openapi`,
        "strict-openai-compliance": "false",
        model: "deepseek-ai/deepseek-v3.2-maas",
    }),
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
    }),

    // ============================================================================
    // Scaleway - mistral, qwen-coder
    // ============================================================================
    "mistral-small-3.2-24b-instruct-2506": () =>
        createScalewayModelConfig({
            model: "mistral-small-3.2-24b-instruct-2506",
        }),
    "qwen2.5-coder-32b-instruct": () =>
        createScalewayModelConfig({
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
    }),
    "claude-sonnet-4-5-vertex": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GOOGLE_PROJECT_ID,
        "vertex-region": "europe-west1",
        "vertex-model-id": "anthropic.claude-sonnet-4-5@20250929",
        "strict-open-ai-compliance": "true",
    }),

    // ============================================================================
    // Fallback Configs - AWS Bedrock primary, Google Vertex AI fallback
    // Uses snake_case for x-portkey-config JSON format
    // ============================================================================
    "claude-sonnet-4-5-fallback": () => ({
        strategy: { mode: "fallback" },
        targets: [
            // Primary: AWS Bedrock (native)
            {
                provider: "bedrock",
                aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,
                aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
                aws_region: process.env.AWS_REGION || "us-east-1",
                override_params: {
                    model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                },
            },
            // Fallback: Google Vertex AI
            {
                provider: "vertex-ai",
                authKey: googleCloudAuth.getAccessToken,
                vertex_project_id: process.env.GOOGLE_PROJECT_ID,
                vertex_region: "europe-west1",
                override_params: {
                    model: "anthropic.claude-sonnet-4-5@20250929",
                },
            },
        ],
    }),
    "claude-opus-4-5-fallback": () => ({
        strategy: { mode: "fallback" },
        targets: [
            // Primary: AWS Bedrock (native)
            {
                provider: "bedrock",
                aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,
                aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
                aws_region: process.env.AWS_REGION || "us-east-1",
                override_params: {
                    model: "global.anthropic.claude-opus-4-5-20251101-v1:0",
                },
            },
            // Fallback: Google Vertex AI
            {
                provider: "vertex-ai",
                authKey: googleCloudAuth.getAccessToken,
                vertex_project_id: process.env.GOOGLE_PROJECT_ID,
                vertex_region: "europe-west1",
                override_params: {
                    model: "anthropic.claude-opus-4-5@20251101",
                },
            },
        ],
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
    "gemini-2.5-pro": () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GOOGLE_PROJECT_ID,
        "vertex-region": "us-central1",
        "vertex-model-id": "gemini-2.5-pro",
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
    // Fireworks AI - glm-4.7, minimax-m2.1, deepseek-v3.2
    // ============================================================================
    "accounts/fireworks/models/glm-4p7": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/glm-4p7",
        }),
    "accounts/fireworks/models/minimax-m2p1": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/minimax-m2p1",
        }),
    "accounts/fireworks/models/deepseek-v3p2": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/deepseek-v3p2",
        }),

    // ============================================================================
    // Community Models - NomNom (web search/scrape/crawl)
    // ============================================================================
    "nomnom": () =>
        createNomNomConfig({
            model: "nomnom",
        }),
};
