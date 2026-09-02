import googleCloudAuth from "../auth/googleCloudAuth.js";
import {
    createAlibabaModelConfig,
    createAzureModelConfig,
    createBedrockNativeConfig,
    createDeepInfraModelConfig,
    createFireworksModelConfig,
    createOpenRouterModelConfig,
    createOVHcloudModelConfig,
    createOVHcloudOAIConfig,
    createPerplexityModelConfig,
    createVercelAIGatewayModelConfig,
} from "./providerConfigs.js";

// =============================================================================
// Helpers
// =============================================================================

type PortkeyConfigFactory = () => Record<string, unknown>;
type PortkeyConfigMap = Record<string, PortkeyConfigFactory>;

function createPinnedOpenRouterConfig(
    model: string,
    providerTag: string,
    maxTokens?: number,
): PortkeyConfigFactory {
    return () =>
        createOpenRouterModelConfig({
            model,
            defaultOptions: {
                ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
                provider: {
                    only: [providerTag],
                    allow_fallbacks: false,
                },
            },
        });
}

/** Creates a direct Vertex AI config for Gemini models. */
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

/** Creates a no-fallback OpenRouter route pinned to one Vertex deployment. */
function createPinnedOpenRouterGeminiConfig(
    modelId: string,
    providerTag: string,
): PortkeyConfigFactory {
    return createPinnedOpenRouterConfig(`google/${modelId}`, providerTag);
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
        ),
    "gpt-5-nano-2025-08-07": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5-nano/chat/completions?api-version=2024-12-01-preview",
        ),
    "gpt-5.4": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.4/chat/completions?api-version=2024-12-01-preview",
        ),
    "gpt-5.4-mini": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.4-mini/chat/completions?api-version=2024-12-01-preview",
        ),

    // -- Azure (Myceli Prod — swedencentral, GPT-5.5) -------------------------
    "gpt-5.5": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_SWEDEN_API_KEY,
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/gpt-5.5/chat/completions?api-version=2024-12-01-preview",
        ),

    // -- Azure (Myceli Prod — eastus, GPT-5.6) --------------------------------
    "gpt-5.6-sol": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-5.6-sol/chat/completions?api-version=2025-04-01-preview",
        ),
    "gpt-5.6-terra": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-5.6-terra/chat/completions?api-version=2025-04-01-preview",
        ),
    "gpt-5.6-luna": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-5.6-luna/chat/completions?api-version=2025-04-01-preview",
        ),

    // -- Azure (Myceli Prod — swedencentral, audio mini) ------------------------
    "gpt-audio-mini-2025-12-15": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_SWEDEN_API_KEY,
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/gpt-audio-mini/chat/completions?api-version=2025-01-01-preview",
        ),
    // -- Azure (Myceli Prod — swedencentral, audio) ---------------------------
    "gpt-audio-1.5": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_SWEDEN_API_KEY,
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/gpt-audio-1.5/chat/completions?api-version=2025-01-01-preview",
        ),

    // -- Azure (Myceli Prod — eastus, xAI Grok) -------------------------------
    "grok-4-20-non-reasoning": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4-20-non-reasoning/chat/completions?api-version=2024-12-01-preview",
        ),
    "grok-4-20-reasoning": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4-20-reasoning/chat/completions?api-version=2024-12-01-preview",
        ),
    "grok-4.3": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4.3/chat/completions?api-version=2024-12-01-preview",
        ),
    "grok-4.6": () => ({
        provider: "openai",
        directEndpoint:
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4.6/chat/completions?api-version=2024-12-01-preview",
        directAuthHeader: "api-key",
        authKey: process.env.AZURE_MYCELI_PROD_API_KEY,
        model: "grok-4.6",
    }),

    // -- Azure (Myceli Prod — eastus, Cohere) --------------------------------
    "Cohere-command-a-plus-05-2026": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Cohere-command-a-plus-05-2026/chat/completions?api-version=2024-12-01-preview",
        ),

    // -- OpenRouter (frontier models) ----------------------------------------
    "xiaomi/mimo-v2.5": createPinnedOpenRouterConfig(
        "xiaomi/mimo-v2.5",
        "xiaomi/fp8",
    ),
    "xiaomi/mimo-v2.5-pro": createPinnedOpenRouterConfig(
        "xiaomi/mimo-v2.5-pro",
        "xiaomi/fp8",
    ),
    "minimax/minimax-m2.7": createPinnedOpenRouterConfig(
        "minimax/minimax-m2.7",
        "deepinfra/fp8",
    ),
    // Reasoning models: explicit max_tokens default below. Without one, the
    // upstream provider's own default applies (Chutes AI defaults to 1024),
    // which reasoning models can burn entirely on their internal thinking
    // trace before emitting any visible text — a blank, still-billed answer.
    // `sort: "price"` means routing can move to a low-default provider at
    // any time, so this isn't just a Chutes-pinned-model problem.
    "qwen/qwen3.7-plus": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3.7-plus",
            defaultOptions: { max_tokens: 64000, provider: { sort: "price" } },
        }),
    "qwen/qwen3.7-max": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3.7-max",
            defaultOptions: { max_tokens: 64000, provider: { sort: "price" } },
        }),
    // Confirmed bug: pinned only to Chutes, whose max_tokens default (1024)
    // is entirely consumed by the reasoning trace on non-trivial prompts,
    // producing a blank visible response that still bills completion tokens.
    "qwen/qwen3.8-27b": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3.8-27b",
            defaultOptions: {
                max_tokens: 64000,
                provider: {
                    only: ["Chutes"],
                    allow_fallbacks: false,
                },
            },
        }),
    "qwen3.8-27b-openrouter-akashml": createPinnedOpenRouterConfig(
        "qwen/qwen3.8-27b",
        "akashml/fp8",
        64000,
    ),
    "qwen/qwen3.8-max": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3.8-max",
            defaultOptions: {
                max_tokens: 64000,
                provider: {
                    only: ["Alibaba"],
                    allow_fallbacks: false,
                },
            },
        }),
    "qwen/qwen3.7-flash": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3.7-flash",
            defaultOptions: {
                max_tokens: 64000,
                provider: {
                    only: ["Alibaba"],
                    allow_fallbacks: false,
                },
            },
        }),
    "poolside/laguna-s-2.1": () =>
        createOpenRouterModelConfig({
            model: "poolside/laguna-s-2.1",
            defaultOptions: {
                provider: {
                    only: ["Poolside"],
                    allow_fallbacks: false,
                },
            },
        }),
    "meituan/longcat-2.0": () =>
        createOpenRouterModelConfig({
            model: "meituan/longcat-2.0",
            defaultOptions: {
                provider: {
                    only: ["atlas-cloud/fp8"],
                    allow_fallbacks: false,
                },
            },
        }),
    "thinkingmachines/inkling-small": () =>
        createOpenRouterModelConfig({
            model: "thinkingmachines/inkling-small",
            defaultOptions: {
                provider: {
                    only: ["Together"],
                    allow_fallbacks: false,
                },
            },
        }),

    // -- DeepInfra (NVIDIA) ---------------------------------------------------
    "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B": () =>
        createDeepInfraModelConfig({
            model: "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B",
            defaultOptions: {
                normalizeFinishReasonAtTokenLimit: true,
            },
        }),

    // -- OpenRouter (Gemma) ---------------------------------------------------
    // Novita preserves remote image URLs; NextBit rejects that public input form.
    "google/gemma-4-26b-a4b-it": createPinnedOpenRouterConfig(
        "google/gemma-4-26b-a4b-it",
        "novita/bf16",
    ),
    "google/gemma-4-31b-it": createPinnedOpenRouterConfig(
        "google/gemma-4-31b-it",
        "novita/bf16",
    ),

    // -- Exact-checkpoint text fallbacks -------------------------------------
    "deepseek-ai/DeepSeek-V4-Flash-0731": () =>
        createDeepInfraModelConfig({
            model: "deepseek-ai/DeepSeek-V4-Flash-0731",
        }),
    "MiniMaxAI/MiniMax-M2.7": () =>
        createDeepInfraModelConfig({ model: "MiniMaxAI/MiniMax-M2.7" }),
    "Qwen/Qwen3.8-2.4T-A95B": () =>
        createDeepInfraModelConfig({ model: "Qwen/Qwen3.8-2.4T-A95B" }),
    "moonshotai/Kimi-K2.6": () =>
        createDeepInfraModelConfig({ model: "moonshotai/Kimi-K2.6" }),
    "meta-llama/Llama-3.3-70B-Instruct-Turbo": () =>
        createDeepInfraModelConfig({
            model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        }),
    "google/gemma-4-26B-A4B-it": () =>
        createDeepInfraModelConfig({ model: "google/gemma-4-26B-A4B-it" }),
    "google/gemma-4-31B-it": () =>
        createDeepInfraModelConfig({ model: "google/gemma-4-31B-it" }),
    "mistral-large-openrouter-zdr": createPinnedOpenRouterConfig(
        "mistralai/mistral-large-2512",
        "mistral/zdr",
    ),
    "claude-opus-4.7-openrouter-vertex": createPinnedOpenRouterConfig(
        "anthropic/claude-opus-4.7",
        "google-vertex/global",
    ),
    "llama-scout-openrouter-deepinfra": createPinnedOpenRouterConfig(
        "meta-llama/llama-4-scout",
        "deepinfra/fp8",
    ),
    "grok-openrouter-xai-zdr": createPinnedOpenRouterConfig(
        "x-ai/grok-4.20",
        "xai/zdr",
    ),
    "grok-large-openrouter-xai-zdr": createPinnedOpenRouterConfig(
        "x-ai/grok-4.3",
        "xai/zdr",
    ),
    "claude-fast-openrouter-vertex": createPinnedOpenRouterConfig(
        "anthropic/claude-haiku-4.5",
        "google-vertex/global",
    ),
    "claude-fable-5-openrouter-vertex": createPinnedOpenRouterConfig(
        "anthropic/claude-fable-5",
        "google-vertex/global",
    ),
    "muse-glimmer-openrouter-deepinfra": createPinnedOpenRouterConfig(
        "meta/muse-glimmer-30b",
        "deepinfra/bf16",
    ),
    "nemotron-3.5-lightning-openrouter-coreweave": createPinnedOpenRouterConfig(
        "nvidia/nemotron-3.5-lightning",
        "coreweave/bf16",
    ),
    "mistral-openrouter-eu": createPinnedOpenRouterConfig(
        "mistralai/mistral-small-2603",
        "mistral/eu",
    ),
    "gemini-openrouter-ai-studio-priority": createPinnedOpenRouterGeminiConfig(
        "gemini-3.7-flash",
        "google-ai-studio/priority",
    ),
    "gemini-fast-openrouter-ai-studio": createPinnedOpenRouterGeminiConfig(
        "gemini-2.5-flash-lite",
        "google-ai-studio",
    ),
    "gemini-flash-lite-3.5-openrouter-ai-studio-flex":
        createPinnedOpenRouterGeminiConfig(
            "gemini-3.5-flash-lite",
            "google-ai-studio/flex",
        ),
    "gemini-large-openrouter-ai-studio": createPinnedOpenRouterGeminiConfig(
        "gemini-3.1-pro-preview",
        "google-ai-studio",
    ),
    "qwen-vision-pro-openrouter-novita": createPinnedOpenRouterConfig(
        "qwen/qwen3-vl-235b-a22b-thinking",
        "novita/bf16",
    ),
    "glm-5.3-openrouter-friendli": createPinnedOpenRouterConfig(
        "z-ai/glm-5.3",
        "friendli",
    ),
    "kimi-code-deepinfra": () =>
        createDeepInfraModelConfig({ model: "moonshotai/Kimi-K2.7-Code" }),
    "qwen-coder-large-openrouter-streamlake": createPinnedOpenRouterConfig(
        "qwen/qwen3-coder-next",
        "streamlake",
    ),

    // -- OpenRouter (Inception Labs) -----------------------------------------
    "mercury-2": () =>
        createOpenRouterModelConfig({
            model: "inception/mercury-2",
            defaultOptions: {
                provider: {
                    only: ["Inception"],
                    allow_fallbacks: false,
                },
            },
        }),
    "inception/mercury-2.5-preview": createPinnedOpenRouterConfig(
        "inception/mercury-2.5-preview",
        "Inception",
        64000,
    ),

    // -- Fireworks AI (DeepSeek) ---------------------------------------------
    "accounts/fireworks/models/deepseek-v4-flash-0731": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/deepseek-v4-flash-0731",
        }),
    "accounts/fireworks/models/deepseek-v4-flash-vision-exp": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/deepseek-v4-flash-vision-exp",
        }),
    "accounts/fireworks/models/deepseek-v4-pro-0813": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/deepseek-v4-pro-0813",
        }),

    // -- Fireworks AI (Kimi, GLM, Qwen) --------------------------------------
    "accounts/fireworks/models/kimi-k2p6": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/kimi-k2p6",
        }),
    "accounts/fireworks/models/kimi-k2p7-code": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/kimi-k2p7-code",
        }),
    "accounts/fireworks/models/kimi-k3": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/kimi-k3",
        }),
    "accounts/fireworks/models/qwen3p8-2p4t-a95b": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/qwen3p8-2p4t-a95b",
        }),

    // -- OpenRouter (Mistral Small 3.2, Mistral Small 4) ---------------------
    // Moved off Azure: Mistral Small was Marketplace SaaS pass-through on
    // Azure (not credit-eligible). Bumped the 2503 alias from 3.1 → 3.2 since
    // OpenRouter 3.2 is ~37% cheaper than the Azure 3.1 we were paying.
    "mistral-small-2503": createPinnedOpenRouterConfig(
        "mistralai/mistral-small-3.2-24b-instruct",
        "deepinfra/fp8",
    ),
    "mistral-small-2603": () =>
        createOpenRouterModelConfig({
            model: "mistralai/mistral-small-2603",
            defaultOptions: {
                max_tokens: 64000,
                provider: {
                    only: ["mistral"],
                    ignore: ["mistral/zdr", "mistral/us", "mistral/eu"],
                    allow_fallbacks: false,
                },
            },
        }),

    // -- Azure (Myceli Prod — eastus, Mistral Large) -------------------------
    "Mistral-Large-3": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Mistral-Large-3/chat/completions?api-version=2024-12-01-preview",
        ),

    // -- Claude via AWS Bedrock -----------------------------------------------
    "claude-sonnet-4-6": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-sonnet-4-6",
            defaultOptions: { max_tokens: 64000 },
        }),
    "claude-sonnet-5": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-sonnet-5",
            defaultOptions: { max_tokens: 64000 },
        }),
    "claude-opus-4-6": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-opus-4-6-v1",
            defaultOptions: { max_tokens: 128000 },
        }),
    // global.* inference profiles for Opus 4.7/4.8 return Bedrock-side
    // Internal/ServiceUnavailable errors; the us.* profiles are healthy.
    "claude-opus-4-7": () =>
        createBedrockNativeConfig({
            model: "us.anthropic.claude-opus-4-7",
            defaultOptions: { max_tokens: 128000 },
        }),
    "claude-opus-5": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-opus-5",
            defaultOptions: { max_tokens: 128000 },
        }),
    "claude-fable-5": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-fable-5",
            defaultOptions: { max_tokens: 128000 },
        }),
    "anthropic/claude-fable-5.1": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-fable-5-1",
            defaultOptions: { max_tokens: 128000 },
        }),
    "claude-haiku-4-5": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
            defaultOptions: { max_tokens: 64000 },
        }),

    // -- AWS Bedrock (Nova) ---------------------------------------------------
    "nova-micro": () =>
        createBedrockNativeConfig({ model: "us.amazon.nova-micro-v1:0" }),
    "nova-2-lite": () =>
        createBedrockNativeConfig({ model: "us.amazon.nova-2-lite-v1:0" }),

    // -- OpenRouter (Gemini via pinned Google Vertex routes) -----------------
    "google/gemini-3-flash-preview": createPinnedOpenRouterGeminiConfig(
        "gemini-3-flash-preview",
        "google-vertex/global",
    ),
    "google/gemini-3.1-pro-preview": createPinnedOpenRouterGeminiConfig(
        "gemini-3.1-pro-preview",
        "google-vertex/global",
    ),
    "google/gemini-2.5-flash-lite": createPinnedOpenRouterGeminiConfig(
        "gemini-2.5-flash-lite",
        "google-vertex/eu",
    ),
    "google/gemini-3.5-flash-lite": createPinnedOpenRouterGeminiConfig(
        "gemini-3.5-flash-lite",
        "google-vertex/global",
    ),
    "google/gemini-3.7-flash": createPinnedOpenRouterGeminiConfig(
        "gemini-3.7-flash",
        "google-vertex/global",
    ),

    // -- Google Vertex AI (dedicated Gemini Search services) -----------------
    "vertex/gemini-2.5-flash-lite": createVertexGeminiConfig(
        "gemini-2.5-flash-lite",
        "global",
    ),
    "vertex/gemini-3.5-flash-lite": createVertexGeminiConfig(
        "gemini-3.5-flash-lite",
        "global",
    ),
    "vertex/gemini-3.6-flash": createVertexGeminiConfig(
        "gemini-3.6-flash",
        "global",
    ),

    // -- Perplexity -----------------------------------------------------------
    "sonar": () => createPerplexityModelConfig({ model: "sonar" }),
    "sonar-pro": () => createPerplexityModelConfig({ model: "sonar-pro" }),
    "sonar-reasoning-pro": () =>
        createPerplexityModelConfig({ model: "sonar-reasoning-pro" }),

    "accounts/fireworks/models/glm-5p2": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/glm-5p2",
        }),
    "accounts/fireworks/models/glm-5p3": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/glm-5p3",
            defaultOptions: { max_tokens: 64000 },
        }),
    "accounts/fireworks/models/glm-5p3-flash": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/glm-5p3-flash",
            defaultOptions: { max_tokens: 64000 },
        }),
    "accounts/fireworks/models/minimax-m3": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/minimax-m3",
        }),
    "accounts/fireworks/models/muse-glimmer-30b": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/muse-glimmer-30b",
        }),
    "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
        }),
    "accounts/fireworks/models/inkling": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/inkling",
        }),

    // -- Vercel AI Gateway (Meta) --------------------------------------------
    "meta/muse-spark-1.2": () =>
        createVercelAIGatewayModelConfig({
            model: "meta/muse-spark-1.2",
        }),

    // -- Azure (Myceli Prod — eastus, Meta Llama) ----------------------------
    "Llama-3.3-70B-Instruct": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Llama-3.3-70B-Instruct/chat/completions?api-version=2024-12-01-preview",
        ),
    "Llama-4-Maverick-17B-128E-Instruct-FP8": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Llama-4-Maverick-17B-128E-Instruct-FP8/chat/completions?api-version=2024-12-01-preview",
            { requiresBase64ImageUrls: true },
        ),
    // Llama 4 Scout is Marketplace SaaS pass-through on Azure (not
    // credit-eligible). OpenRouter is the cheapest provider with the same SKU.
    "Llama-4-Scout-17B-16E-Instruct": createPinnedOpenRouterConfig(
        "meta/llama-4-scout",
        "deepinfra/fp8",
    ),

    // -- OpenRouter (Qwen Coder, Qwen VL) -------------------------------------
    // Exact provider pins keep OpenRouter routing and billing deterministic.
    "qwen/qwen3-coder-next": createPinnedOpenRouterConfig(
        "qwen/qwen3-coder-next",
        "parasail/bf16",
    ),
    "qwen/qwen3-vl-30b-a3b-instruct": createPinnedOpenRouterConfig(
        "qwen/qwen3-vl-30b-a3b-instruct",
        "alibaba",
    ),
    "qwen3-vl-235b-a22b-thinking": () =>
        createAlibabaModelConfig({
            model: "qwen3-vl-235b-a22b-thinking",
        }),

    // -- OpenRouter (StepFun) -------------------------------------------------
    "stepfun/step-3.5-flash": () =>
        createOpenRouterModelConfig({
            model: "stepfun/step-3.5-flash",
        }),

    // -- DeepInfra (StepFun) --------------------------------------------------
    "stepfun-ai/Step-3.7-Flash": () =>
        createDeepInfraModelConfig({
            model: "stepfun-ai/Step-3.7-Flash",
        }),

    // -- OVHcloud -------------------------------------------------------------
    "gpt-oss-20b": () =>
        createOVHcloudOAIConfig({
            model: "gpt-oss-20b",
            "max-tokens": 1500,
        }),
    "qwen3-coder-30b-a3b-instruct": () =>
        createOVHcloudModelConfig({ model: "Qwen3-Coder-30B-A3B-Instruct" }),
    "Qwen3Guard-Gen-8B": () =>
        createOVHcloudOAIConfig({ model: "Qwen3Guard-Gen-8B" }),
};
