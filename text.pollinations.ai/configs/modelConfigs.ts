import googleCloudAuth from "../auth/googleCloudAuth.js";
import {
    createAirforceModelConfig,
    createAnthropicConfig,
    createAzureModelConfig,
    createBedrockNativeConfig,
    createFireworksModelConfig,
    createMyceliGrok4FastConfig,
    createNomNomConfig,
    createOVHcloudMistralConfig,
    createOVHcloudModelConfig,
    createPerplexityModelConfig,
    createPollyConfig,
    createScalewayModelConfig,
} from "./providerConfigs.js";

// =============================================================================
// Helpers
// =============================================================================

type PortkeyConfigFactory = () => Record<string, unknown>;
type PortkeyConfigMap = Record<string, PortkeyConfigFactory>;

/** Creates a Vertex AI config for Gemini models. */
function createVertexGeminiConfig(
    modelId: string,
    region: string,
): PortkeyConfigFactory {
    return () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GOOGLE_PROJECT_ID,
        "vertex-region": region,
        "vertex-model-id": modelId,
        "strict-openai-compliance": "false",
    });
}

/** Creates a Vertex AI config for Claude models. */
function createVertexClaudeConfig(modelId: string): PortkeyConfigFactory {
    return () => ({
        provider: "vertex-ai",
        authKey: googleCloudAuth.getAccessToken,
        "vertex-project-id": process.env.GOOGLE_PROJECT_ID,
        "vertex-region": "europe-west1",
        "vertex-model-id": modelId,
        "strict-open-ai-compliance": "true",
    });
}

/** Creates an Azure config with a max-completion-tokens limit. */
function createAzureWithMaxTokens(
    apiKeyEnv: string | undefined,
    endpointEnv: string | undefined,
    modelName: string,
    maxTokens: number,
): PortkeyConfigFactory {
    return () => ({
        ...createAzureModelConfig(apiKeyEnv, endpointEnv, modelName),
        "max-completion-tokens": maxTokens,
    });
}

// =============================================================================
// Portkey Configuration Map
// =============================================================================

export const portkeyConfig: PortkeyConfigMap = {
    // -- Azure (Myceli) -------------------------------------------------------
    "gpt-5-mini": createAzureWithMaxTokens(
        process.env.AZURE_PF_GPT5MINI_API_KEY,
        process.env.AZURE_PF_GPT5MINI_ENDPOINT,
        "gpt-5-mini",
        16384,
    ),
    "gpt-5.2-2025-12-11": createAzureWithMaxTokens(
        process.env.AZURE_MYCELI_GPT52_API_KEY,
        process.env.AZURE_MYCELI_GPT52_ENDPOINT,
        "gpt-5.2-2025-12-11",
        16384,
    ),
    "gpt-4o-mini-audio-preview-2024-12-17": createAzureWithMaxTokens(
        process.env.AZURE_MYCELI_GPT4O_AUDIO_API_KEY,
        process.env.AZURE_MYCELI_GPT4O_AUDIO_ENDPOINT,
        "gpt-4o-mini-audio-preview-2024-12-17",
        2048,
    ),
    "myceli-grok-4-fast": createMyceliGrok4FastConfig,

    // -- Azure (PointsFlyer) --------------------------------------------------
    "gpt-5-nano-2025-08-07": createAzureWithMaxTokens(
        process.env.AZURE_PF_GPT5NANO_API_KEY,
        process.env.AZURE_PF_GPT5NANO_ENDPOINT,
        "gpt-5-nano-2025-08-07",
        512,
    ),

    // -- Scaleway -------------------------------------------------------------
    "qwen2.5-coder-32b-instruct": () =>
        createScalewayModelConfig({ model: "qwen2.5-coder-32b-instruct" }),

    // -- OVHcloud Mistral -----------------------------------------------------
    "mistral-small-3.2-24b-instruct-2506": () =>
        createOVHcloudMistralConfig({
            model: "Mistral-Small-3.2-24B-Instruct-2506",
        }),

    // -- AWS Bedrock ----------------------------------------------------------
    "us.anthropic.claude-haiku-4-5-20251001-v1:0": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        }),
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        }),
    "us.anthropic.claude-sonnet-4-6": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-sonnet-4-6",
        }),
    "global.anthropic.claude-opus-4-5-20251101-v1:0": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-opus-4-5-20251101-v1:0",
        }),
    "global.anthropic.claude-opus-4-6-v1": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-opus-4-6-v1",
        }),

    // -- Google Vertex AI (Claude) --------------------------------------------
    "claude-opus-4-5-vertex": createVertexClaudeConfig(
        "anthropic.claude-opus-4-5@20251101",
    ),
    "claude-sonnet-4-6-vertex": createVertexClaudeConfig(
        "anthropic.claude-sonnet-4-6",
    ),

    // -- Claude Direct Anthropic API ------------------------------------------
    "claude-sonnet-4-6": () =>
        createAnthropicConfig({
            model: "claude-sonnet-4-6",
            defaultOptions: { max_tokens: 64000 },
        }),
    "claude-opus-4-6": () =>
        createAnthropicConfig({
            model: "claude-opus-4-6",
            defaultOptions: { max_tokens: 128000 },
        }),
    "claude-opus-4-5": () =>
        createAnthropicConfig({
            model: "claude-opus-4-5-20251101",
            defaultOptions: { max_tokens: 64000 },
        }),
    "claude-haiku-4-5": () =>
        createAnthropicConfig({
            model: "claude-haiku-4-5-20251001",
            defaultOptions: { max_tokens: 64000 },
        }),

    // -- AWS Bedrock (Nova) ---------------------------------------------------
    "amazon.nova-micro-v1:0": () =>
        createBedrockNativeConfig({ model: "amazon.nova-micro-v1:0" }),
    "nova-micro-fallback": () => ({
        strategy: { mode: "fallback" },
        targets: [
            {
                provider: "bedrock",
                aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,
                aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
                aws_region: process.env.AWS_REGION || "us-east-1",
                override_params: { model: "amazon.nova-micro-v1:0" },
            },
            {
                provider: "bedrock",
                aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,
                aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
                aws_region: process.env.AWS_REGION || "us-east-1",
                override_params: { model: "amazon.nova-lite-v1:0" },
            },
        ],
    }),

    // -- Google Vertex AI (Gemini) --------------------------------------------
    "gemini-3-flash-preview": createVertexGeminiConfig(
        "gemini-3-flash-preview",
        "global",
    ),
    "gemini-3.1-pro-preview": createVertexGeminiConfig(
        "gemini-3.1-pro-preview",
        "global",
    ),
    "gemini-2.5-flash-lite": createVertexGeminiConfig(
        "gemini-2.5-flash-lite",
        "us-central1",
    ),
    "gemini-3-pro-preview": createVertexGeminiConfig(
        "gemini-3-pro-preview",
        "global",
    ),
    "gemini-2.5-pro": createVertexGeminiConfig("gemini-2.5-pro", "us-central1"),

    // -- Google Vertex AI (Kimi via MaaS) -------------------------------------
    "kimi-k2-thinking-maas": () => ({
        provider: "openai",
        authKey: googleCloudAuth.getAccessToken,
        "custom-host": `https://aiplatform.googleapis.com/v1/projects/${process.env.GOOGLE_PROJECT_ID}/locations/global/endpoints/openapi`,
        "strict-openai-compliance": "false",
        model: "moonshotai/kimi-k2-thinking-maas",
    }),

    // -- Perplexity -----------------------------------------------------------
    "sonar": () => createPerplexityModelConfig({ model: "sonar" }),
    "sonar-reasoning": () =>
        createPerplexityModelConfig({ model: "sonar-reasoning" }),
    "sonar-reasoning-pro": () =>
        createPerplexityModelConfig({ model: "sonar-reasoning-pro" }),

    // -- OVHcloud (Qwen) ------------------------------------------------------
    "qwen3-coder-30b-a3b-instruct": () =>
        createOVHcloudModelConfig({ model: "Qwen3-Coder-30B-A3B-Instruct" }),
    "Qwen3Guard-Gen-8B": () =>
        createOVHcloudMistralConfig({ model: "Qwen3Guard-Gen-8B" }),

    // -- Fireworks AI ---------------------------------------------------------
    "accounts/fireworks/models/kimi-k2p5": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/kimi-k2p5",
        }),
    "accounts/fireworks/models/glm-5": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/glm-5",
        }),
    "accounts/fireworks/models/minimax-m2p1": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/minimax-m2p1",
        }),
    "accounts/fireworks/models/deepseek-v3p2": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/deepseek-v3p2",
        }),

    // -- Community Models -----------------------------------------------------
    "nomnom": () =>
        createNomNomConfig({
            model: "nomnom",
        }),
    "polly": () =>
        createPollyConfig({
            model: "polly",
        }),

    // -- api.airforce ---------------------------------------------------------
    "qwen-character": () =>
        createAirforceModelConfig({ model: "qwen-character" }),
};
