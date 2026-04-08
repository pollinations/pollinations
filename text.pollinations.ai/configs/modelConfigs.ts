import googleCloudAuth from "../auth/googleCloudAuth.js";
import {
    createAzureModelConfig,
    createBedrockNativeConfig,
    createDashScopeModelConfig,
    createFireworksModelConfig,
    createOVHcloudMistralConfig,
    createOVHcloudModelConfig,
    createPerplexityModelConfig,
    createPollyConfig,
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

// =============================================================================
// Portkey Configuration Map
// =============================================================================

export const portkeyConfig: PortkeyConfigMap = {
    // -- Azure (Myceli Prod — eastus, OpenAI) ---------------------------------
    "gpt-5-mini": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5-mini/chat/completions?api-version=2024-12-01-preview",
            "gpt-5-mini",
        ),
    "gpt-5-nano": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5-nano/chat/completions?api-version=2024-12-01-preview",
            "gpt-5-nano",
        ),
    "gpt-5.4-mini": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.4-mini/chat/completions?api-version=2024-12-01-preview",
            "gpt-5.4-mini",
        ),
    "gpt-5.4-nano": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.4-nano/chat/completions?api-version=2024-12-01-preview",
            "gpt-5.4-nano",
        ),
    "gpt-5.2": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.2/chat/completions?api-version=2024-12-01-preview",
            "gpt-5.2",
        ),
    "gpt-5.4": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.4/chat/completions?api-version=2024-12-01-preview",
            "gpt-5.4",
        ),

    // -- Azure (old oai-models-resource — keep until follow-up PR) -------------
    "gpt-audio-mini-2025-12-15": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_GPT_AUDIO_MINI_API_KEY,
            process.env.AZURE_MYCELI_GPT_AUDIO_MINI_ENDPOINT,
            "gpt-audio-mini-2025-12-15",
        ),
    // -- Azure (Myceli Prod — swedencentral, audio) ---------------------------
    "gpt-audio-1.5": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_SWEDEN_API_KEY,
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/gpt-audio-1.5/chat/completions?api-version=2025-01-01-preview",
            "gpt-audio-1.5",
        ),

    // -- Azure (Myceli Prod — eastus, xAI Grok) -------------------------------
    "grok-4-1-fast-non-reasoning": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4-1-fast-non-reasoning/chat/completions?api-version=2024-12-01-preview",
            "grok-4-1-fast-non-reasoning",
        ),
    "grok-4-20-reasoning": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4-20-reasoning/chat/completions?api-version=2024-12-01-preview",
            "grok-4-20-reasoning",
        ),

    // -- Azure (Myceli Prod — eastus, DeepSeek) -------------------------------
    "DeepSeek-V3.2": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/DeepSeek-V3.2/chat/completions?api-version=2024-12-01-preview",
            "DeepSeek-V3.2",
        ),
    // -- Azure (Myceli Prod — eastus, Kimi) -----------------------------------
    "Kimi-K2.5": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Kimi-K2.5/chat/completions?api-version=2024-12-01-preview",
            "Kimi-K2.5",
        ),

    // -- OVHcloud Mistral (cheaper than Azure, same model) ---------------------
    "mistral-small-3.2-24b-instruct-2506": () =>
        createOVHcloudMistralConfig({
            model: "Mistral-Small-3.2-24B-Instruct-2506",
        }),

    // -- Azure (Myceli Prod — eastus, Mistral Large) --------------------------
    "Mistral-Large-3": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Mistral-Large-3/chat/completions?api-version=2024-12-01-preview",
            "Mistral-Large-3",
        ),

    // -- Claude via AWS Bedrock -----------------------------------------------
    "claude-sonnet-4-6": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-sonnet-4-6",
            defaultOptions: { max_tokens: 64000 },
        }),
    "claude-opus-4-6": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-opus-4-6-v1",
            defaultOptions: { max_tokens: 128000 },
        }),
    "claude-opus-4-5": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-opus-4-5-20251101-v1:0",
            defaultOptions: { max_tokens: 64000 },
        }),
    "claude-haiku-4-5": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
            defaultOptions: { max_tokens: 64000 },
        }),

    // -- AWS Bedrock (Nova) ---------------------------------------------------
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
    "nova-2-lite": () =>
        createBedrockNativeConfig({ model: "us.amazon.nova-2-lite-v1:0" }),

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
    "gemini-3.1-flash-lite-preview": createVertexGeminiConfig(
        "gemini-3.1-flash-lite-preview",
        "global",
    ),
    "gemini-2.5-pro": createVertexGeminiConfig("gemini-2.5-pro", "us-central1"),

    // -- Perplexity -----------------------------------------------------------
    "sonar": () => createPerplexityModelConfig({ model: "sonar" }),
    "sonar-reasoning-pro": () =>
        createPerplexityModelConfig({ model: "sonar-reasoning-pro" }),

    // -- Alibaba DashScope (Qwen) ---------------------------------------------
    "qwen3-coder-next": () =>
        createDashScopeModelConfig({ model: "qwen3-coder-next" }),
    "qwen3.5-plus": () => createDashScopeModelConfig({ model: "qwen3.5-plus" }),
    "qwen3-vl-plus": () =>
        createDashScopeModelConfig({ model: "qwen3-vl-plus" }),

    // -- OVHcloud (Qwen) ------------------------------------------------------
    "qwen3-coder-30b-a3b-instruct": () =>
        createOVHcloudModelConfig({ model: "Qwen3-Coder-30B-A3B-Instruct" }),
    "Qwen3Guard-Gen-8B": () =>
        createOVHcloudMistralConfig({ model: "Qwen3Guard-Gen-8B" }),

    // -- Fireworks AI (GLM, MiniMax — staying on Fireworks for now) -----------
    "accounts/fireworks/models/glm-5": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/glm-5",
        }),
    "accounts/fireworks/models/minimax-m2p5": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/minimax-m2p5",
        }),

    // -- Community Models -----------------------------------------------------
    "polly": () =>
        createPollyConfig({
            model: "polly",
        }),
};
