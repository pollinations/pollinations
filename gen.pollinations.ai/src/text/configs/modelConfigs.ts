import googleCloudAuth from "../auth/googleCloudAuth.js";
import {
    createAzureModelConfig,
    createBedrockNativeConfig,
    createDashScopeModelConfig,
    createDeepInfraModelConfig,
    createFireworksModelConfig,
    createOpenRouterModelConfig,
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
    "gpt-5.4-nano": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.4-nano/chat/completions?api-version=2024-12-01-preview",
            "gpt-5.4-nano",
        ),
    "gpt-5-nano-2025-08-07": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5-nano/chat/completions?api-version=2024-12-01-preview",
            "gpt-5-nano-2025-08-07",
        ),
    "gpt-5.4": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.4/chat/completions?api-version=2024-12-01-preview",
            "gpt-5.4",
        ),

    // -- Azure (Myceli Prod — swedencentral, GPT-5.5) -------------------------
    "gpt-5.5": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_SWEDEN_API_KEY,
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/gpt-5.5/chat/completions?api-version=2024-12-01-preview",
            "gpt-5.5",
        ),

    // -- Azure (Myceli Prod — swedencentral, audio mini) ------------------------
    "gpt-audio-mini-2025-12-15": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_SWEDEN_API_KEY,
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/gpt-audio-mini/chat/completions?api-version=2025-01-01-preview",
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
    "grok-4-20-non-reasoning": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4-20-non-reasoning/chat/completions?api-version=2024-12-01-preview",
            "grok-4-20-non-reasoning",
        ),
    "grok-4-20-reasoning": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4-20-reasoning/chat/completions?api-version=2024-12-01-preview",
            "grok-4-20-reasoning",
        ),

    // -- DeepInfra (Gemma) ----------------------------------------------------
    "google/gemma-4-26B-A4B-it": () =>
        createDeepInfraModelConfig({
            model: "google/gemma-4-26B-A4B-it",
        }),

    // -- OpenRouter (DeepSeek) -----------------------------------------------
    "deepseek/deepseek-v4-flash": () =>
        createOpenRouterModelConfig({
            model: "deepseek/deepseek-v4-flash",
        }),

    // -- Fireworks AI (DeepSeek) ---------------------------------------------
    "accounts/fireworks/models/deepseek-v4-pro": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/deepseek-v4-pro",
        }),

    // -- Fireworks AI (Kimi, GLM, Qwen) --------------------------------------
    "accounts/fireworks/models/kimi-k2p5": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/kimi-k2p5",
        }),
    "accounts/fireworks/models/kimi-k2p6": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/kimi-k2p6",
        }),

    // -- OpenRouter (Mistral Small 3.2, Mistral Small 4) ---------------------
    // Moved off Azure: Mistral Small was Marketplace SaaS pass-through on
    // Azure (not credit-eligible). Bumped the 2503 alias from 3.1 → 3.2 since
    // OpenRouter 3.2 is ~37% cheaper than the Azure 3.1 we were paying.
    "mistral-small-2503": () =>
        createOpenRouterModelConfig({
            model: "mistralai/mistral-small-3.2-24b-instruct",
        }),
    "mistral-small-2603": () =>
        createOpenRouterModelConfig({
            model: "mistralai/mistral-small-2603",
        }),

    // -- Azure (Myceli Prod — eastus, Mistral Large) -------------------------
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
    "claude-opus-4-7": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-opus-4-7",
            defaultOptions: { max_tokens: 128000 },
        }),
    "claude-haiku-4-5": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
            defaultOptions: { max_tokens: 64000 },
        }),

    // -- AWS Bedrock (Nova) ---------------------------------------------------
    "nova-micro": () =>
        createBedrockNativeConfig({ model: "amazon.nova-micro-v1:0" }),
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
        "global",
    ),
    "gemini-3.1-flash-lite-preview": createVertexGeminiConfig(
        "gemini-3.1-flash-lite-preview",
        "global",
    ),

    // -- Perplexity -----------------------------------------------------------
    "sonar": () => createPerplexityModelConfig({ model: "sonar" }),
    "sonar-reasoning-pro": () =>
        createPerplexityModelConfig({ model: "sonar-reasoning-pro" }),

    // -- Fireworks AI (Qwen) -----------------------------------------------------
    "accounts/fireworks/models/qwen3p6-plus": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/qwen3p6-plus",
        }),
    "accounts/fireworks/models/glm-5p1": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/glm-5p1",
        }),
    "accounts/fireworks/models/minimax-m2p7": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/minimax-m2p7",
        }),

    // -- Azure (Myceli Prod — eastus, Meta Llama) ----------------------------
    "Llama-3.3-70B-Instruct": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Llama-3.3-70B-Instruct/chat/completions?api-version=2024-12-01-preview",
            "Llama-3.3-70B-Instruct",
        ),
    "Llama-4-Maverick-17B-128E-Instruct-FP8": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Llama-4-Maverick-17B-128E-Instruct-FP8/chat/completions?api-version=2024-12-01-preview",
            "Llama-4-Maverick-17B-128E-Instruct-FP8",
            undefined,
            { requiresBase64ImageUrls: true },
        ),
    // Llama 4 Scout is Marketplace SaaS pass-through on Azure (not
    // credit-eligible). OpenRouter is the cheapest provider with the same SKU.
    "Llama-4-Scout-17B-16E-Instruct": () =>
        createOpenRouterModelConfig({
            model: "meta-llama/llama-4-scout",
        }),

    // -- Alibaba DashScope (Qwen) ---------------------------------------------
    "qwen3-coder-next": () =>
        createDashScopeModelConfig({ model: "qwen3-coder-next" }),

    // -- OpenRouter (Qwen VL) -------------------------------------------------
    "qwen/qwen3-vl-30b-a3b-instruct": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3-vl-30b-a3b-instruct",
        }),
    "qwen/qwen3-vl-235b-a22b-thinking": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3-vl-235b-a22b-thinking",
        }),

    // -- OVHcloud (Qwen) ------------------------------------------------------
    "qwen3-coder-30b-a3b-instruct": () =>
        createOVHcloudModelConfig({ model: "Qwen3-Coder-30B-A3B-Instruct" }),
    "Qwen3Guard-Gen-8B": () =>
        createOVHcloudMistralConfig({ model: "Qwen3Guard-Gen-8B" }),

    // -- Community Models -----------------------------------------------------
    "polly": () =>
        createPollyConfig({
            model: "polly",
        }),
};
