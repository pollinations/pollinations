import googleCloudAuth from "../auth/googleCloudAuth.js";
import { textEnvironmentValue } from "../environment.js";
import type { TransformOptions } from "../types.js";
import {
    createAlibabaModelConfig,
    createAnthropicConfig,
    createAzureModelConfig,
    createAzureResponsesModelConfig,
    createBedrockNativeConfig,
    createDeepInfraModelConfig,
    createFireworksModelConfig,
    createInferencePortModelConfig,
    createMistralModelConfig,
    createNovitaModelConfig,
    createOpenRouterModelConfig,
    createOVHcloudOAIConfig,
    createPerplexityAgentConfig,
    createVercelAIGatewayModelConfig,
} from "./providerConfigs.js";

// =============================================================================
// Helpers
// =============================================================================

type PortkeyConfigFactory = () => Record<string, unknown>;
type PortkeyConfigMap = Record<string, PortkeyConfigFactory>;

// Chat transport settings shared by our Azure OpenAI deployments.
const azureOpenAIParameters = {
    supportsMaxCompletionTokens: true,
    supportsStreamOptions: true,
};

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
    "vllm-sr/d3": () => ({
        provider: "vllm-sr",
        directEndpoint: "https://decision.vllm-sr.ai/v1/systemone",
        authKey: textEnvironmentValue("D3_KEY"),
        model: "vllm-sr/d3",
        decisionsProtocol: "vllm-sr",
    }),
    "stealth/glyph-cluster": () =>
        createVercelAIGatewayModelConfig({
            model: "stealth/glyph-cluster",
            responsesEndpoint: undefined,
            directEndpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
            defaultOptions: {
                providerOptions: { gateway: { only: ["stealth"] } },
            },
        }),
    "span-01-lite": () => ({
        provider: "openrouter",
        directEndpoint: "https://openrouter.ai/api/alpha/decisions",
        authKey: textEnvironmentValue("OPENROUTER_API_KEY"),
        model: "respan/span-01-lite",
        defaultOptions: {
            provider: {
                "only": ["respan"],
                "ignore": ["cloudflare"],
                "allow_fallbacks": false,
            },
        },
    }),
    // Both gateways preserve the native TypeSafe Decisions protocol.
    "jev-1.13": () =>
        createVercelAIGatewayModelConfig({
            directEndpoint:
                "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
            model: "typesafe-ai/jev-1.13.0",
            defaultOptions: {
                providerOptions: {
                    gateway: { only: ["typesafe-ai"] },
                    typesafe: { longContext: true },
                },
            },
        }),
    "typesafe/jev-1.13:openrouter:typesafe": () => ({
        provider: "openrouter",
        directEndpoint: "https://openrouter.ai/api/alpha/decisions",
        authKey: textEnvironmentValue("OPENROUTER_API_KEY"),
        model: "typesafe/jev-1.13",
        defaultOptions: {
            provider: {
                only: ["typesafe"],
                ignore: ["cloudflare"],
                allow_fallbacks: false,
            },
        },
    }),
    "kev-4b": () => ({
        provider: "openrouter",
        directEndpoint: "https://openrouter.ai/api/alpha/decisions",
        authKey: textEnvironmentValue("OPENROUTER_API_KEY"),
        model: "jaredpalmer/kev-4b",
        defaultOptions: {
            provider: {
                "only": ["siliconflow/fp8"],
                "ignore": ["cloudflare"],
                "allow_fallbacks": false,
            },
        },
    }),
    "pplx-decider-v1.2": () =>
        createVercelAIGatewayModelConfig({
            directEndpoint:
                "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
            model: "perplexity/pplx-decider-v1.2",
        }),
    "perplexity/pplx-decider-v1.2:openrouter": () => ({
        provider: "openrouter",
        directEndpoint: "https://openrouter.ai/api/alpha/decisions",
        authKey: textEnvironmentValue("OPENROUTER_API_KEY"),
        model: "perplexity/pplx-decider-v1.2",
    }),
    "liquid-d1": () =>
        createVercelAIGatewayModelConfig({
            directEndpoint:
                "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
            model: "liquid/d1",
            defaultOptions: {
                providerOptions: { gateway: { only: ["liquid"] } },
            },
        }),
    "liquid/d1:openrouter": () => ({
        provider: "openrouter",
        directEndpoint: "https://openrouter.ai/api/alpha/decisions",
        authKey: textEnvironmentValue("OPENROUTER_API_KEY"),
        model: "liquid/d1",
        defaultOptions: {
            provider: {
                only: ["liquid"],
                ignore: ["cloudflare"],
                allow_fallbacks: false,
            },
        },
    }),
    "gpt-6-luna-decisions": () => ({
        provider: "openai",
        directEndpoint: "https://api.openai.com/v1/decisions",
        authKey: textEnvironmentValue("OPENAI_API_KEY"),
        model: "gpt-6-luna",
        decisionsProtocol: "openai",
    }),
    "openai/gpt-6-luna-decisions:openrouter": () => ({
        provider: "openrouter",
        directEndpoint: "https://openrouter.ai/api/alpha/decisions",
        authKey: textEnvironmentValue("OPENROUTER_API_KEY"),
        model: "openai/gpt-6-luna-decisions",
        defaultOptions: {
            provider: {
                only: ["openai"],
                ignore: ["cloudflare"],
                allow_fallbacks: false,
            },
        },
    }),
    "microsoft/microsoft-decision-1:vercel": () =>
        createVercelAIGatewayModelConfig({
            directEndpoint:
                "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
            model: "microsoft/microsoft-decision-1",
            defaultOptions: {
                providerOptions: { gateway: { only: ["azure"] } },
            },
        }),
    "microsoft/microsoft-decision-1:openrouter": () => ({
        provider: "openrouter",
        directEndpoint: "https://openrouter.ai/api/alpha/decisions",
        authKey: textEnvironmentValue("OPENROUTER_API_KEY"),
        model: "microsoft/microsoft-decision-1",
        defaultOptions: {
            provider: {
                only: ["azure"],
                ignore: ["cloudflare"],
                allow_fallbacks: false,
            },
        },
    }),
    // Azure's Microsoft provider endpoint speaks the TypeSafe native shape;
    // `model` is the deployment name.
    "microsoft-decision-1-azure": () => ({
        provider: "openai",
        directEndpoint:
            "https://myceli-prod-eastus.cognitiveservices.azure.com/providers/microsoft/v1/systemone",
        directAuthHeader: "api-key",
        authKey: textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
        model: "decision-1",
    }),
    // -- Azure (Myceli Prod — eastus, OpenAI) ---------------------------------
    "gpt-5.4-nano": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.4-nano/chat/completions?api-version=2024-12-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-5-nano-2025-08-07": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5-nano/chat/completions?api-version=2024-12-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-5.3-codex": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.3-codex/chat/completions?api-version=2025-04-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-5.3-codex-azure-sweden": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_SWEDEN_API_KEY"),
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/gpt-5.3-codex/chat/completions?api-version=2025-04-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-5.4": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.4/chat/completions?api-version=2024-12-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-5.4-mini": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.4-mini/chat/completions?api-version=2024-12-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-5.4-mini-chat": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_API_KEY,
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/gpt-5.4-mini/chat/completions?api-version=2024-12-01-preview",
            azureOpenAIParameters,
        ),

    // -- Azure (Myceli Prod — swedencentral, GPT-5.5) -------------------------
    "gpt-5.5": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_SWEDEN_API_KEY"),
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/gpt-5.5/chat/completions?api-version=2024-12-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-5.5-chat": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_SWEDEN_API_KEY,
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/gpt-5.5/chat/completions?api-version=2024-12-01-preview",
            azureOpenAIParameters,
        ),

    // -- Azure (Myceli Prod — eastus, GPT-5.6) --------------------------------
    "gpt-5.6-sol": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-5.6-sol/chat/completions?api-version=2025-04-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-5.6-terra": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-5.6-terra/chat/completions?api-version=2025-04-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-5.6-luna": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-5.6-luna/chat/completions?api-version=2025-04-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-6-astra": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-6-astra/chat/completions?api-version=2025-04-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-6-astra-azure-datazone": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-6-astra-datazone/chat/completions?api-version=2025-04-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-6-sol": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-6-sol/chat/completions?api-version=2025-04-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-6.1-sol": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-6.1-sol/chat/completions?api-version=2025-04-01-preview",
            azureOpenAIParameters,
        ),
    "gpt-6-luna": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-6-luna/chat/completions?api-version=2025-04-01-preview",
            azureOpenAIParameters,
        ),

    // -- OpenAI direct (GPT-6) -------------------------------------------------
    "gpt-6-sol-openai": () => ({
        provider: "openai",
        responsesEndpoint: "https://api.openai.com/v1/responses",
        authKey: textEnvironmentValue("OPENAI_API_KEY"),
        model: "gpt-6-sol",
    }),
    "gpt-6.1-sol-openai": () => ({
        provider: "openai",
        responsesEndpoint: "https://api.openai.com/v1/responses",
        authKey: textEnvironmentValue("OPENAI_API_KEY"),
        model: "gpt-6.1-sol",
    }),
    "gpt-6-luna-openai": () => ({
        provider: "openai",
        responsesEndpoint: "https://api.openai.com/v1/responses",
        authKey: textEnvironmentValue("OPENAI_API_KEY"),
        model: "gpt-6-luna",
    }),

    // -- Azure (Myceli Prod — swedencentral, audio mini) ------------------------
    "gpt-audio-mini-2025-12-15": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_SWEDEN_API_KEY,
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/gpt-audio-mini/chat/completions?api-version=2025-01-01-preview",
            azureOpenAIParameters,
        ),
    // -- Azure (Myceli Prod — swedencentral, audio) ---------------------------
    "gpt-audio-1.5": () =>
        createAzureModelConfig(
            process.env.AZURE_MYCELI_PROD_SWEDEN_API_KEY,
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/gpt-audio-1.5/chat/completions?api-version=2025-01-01-preview",
            azureOpenAIParameters,
        ),

    // -- Azure (Myceli Prod — eastus, xAI Grok) -------------------------------
    "grok-4-20-non-reasoning": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4-20-non-reasoning/chat/completions?api-version=2024-12-01-preview",
        ),
    "grok-4-20-reasoning": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4-20-reasoning/chat/completions?api-version=2024-12-01-preview",
        ),
    "grok-4.3": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4.3/chat/completions?api-version=2024-12-01-preview",
        ),
    "grok-4.6": () => ({
        provider: "openai",
        directEndpoint:
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4.6/chat/completions?api-version=2024-12-01-preview",
        directAuthHeader: "api-key",
        authKey: textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
        model: "grok-4.6",
        responsesEndpoint:
            "https://myceli-prod-eastus.openai.azure.com/openai/v1/responses",
        responsesAuthHeader: "api-key",
        responsesStreamUpstream: true,
    }),

    // -- xAI direct -----------------------------------------------------------
    "grok-4.6-xai": () => ({
        provider: "openai",
        directEndpoint: "https://api.x.ai/v1/chat/completions",
        authKey: textEnvironmentValue("XAI_API_KEY"),
        model: "grok-4.6",
    }),
    "grok-4.7-xai": () => ({
        provider: "openai",
        directEndpoint: "https://api.x.ai/v1/chat/completions",
        authKey: textEnvironmentValue("XAI_API_KEY"),
        model: "grok-4.7",
    }),

    // -- Azure (Myceli Prod — DeepSeek, Moonshot) ----------------------------
    // Azure DeepSeek reasons only when asked, unlike the Fireworks route it
    // replaces, so this route asks by default.
    "DeepSeek-V4-Flash-0731": () =>
        createAzureModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_SWEDEN_API_KEY"),
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/DeepSeek-V4-Flash-0731/chat/completions?api-version=2024-12-01-preview",
            { defaultOptions: { reasoning_effort: "high" } },
        ),
    // Azure DeepSeek V4.1 rejects remote image URLs.
    "DeepSeek-V4.1-Flash": () =>
        createAzureModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_SWEDEN_API_KEY"),
            "https://myceli-prod-swedencentral.cognitiveservices.azure.com/openai/deployments/DeepSeek-V4.1-Flash/chat/completions?api-version=2024-12-01-preview",
            {
                defaultOptions: { reasoning_effort: "high" },
                requiresBase64ImageUrls: true,
            },
        ),
    // Azure Kimi rejects remote image URLs.
    "Kimi-K2.6": () =>
        createAzureModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Kimi-K2.6/chat/completions?api-version=2024-12-01-preview",
            { requiresBase64ImageUrls: true },
        ),
    // -- OpenRouter (frontier models) ----------------------------------------
    "cohere/command-a-plus": createPinnedOpenRouterConfig(
        "cohere/command-a-plus",
        "Cohere",
    ),
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
        "novita/fp8",
    ),
    "minimax-m2.7-openrouter-minimax": createPinnedOpenRouterConfig(
        "minimax/minimax-m2.7",
        "minimax/fp8",
    ),
    "tencent/hy3": createPinnedOpenRouterConfig("tencent/hy3", "novita"),
    "xiaomi/mimo-v2.6-flash": () =>
        createNovitaModelConfig({ model: "xiaomimimo/mimo-v2.6-flash" }),
    "xiaomi/mimo-v2.6-pro": () =>
        createNovitaModelConfig({ model: "xiaomimimo/mimo-v2.6-pro" }),
    "xiaomi/mimo-v2.6-flash:deepinfra": () =>
        createDeepInfraModelConfig({ model: "XiaomiMiMo/MiMo-V2.6-Flash" }),
    "xiaomi/mimo-v2.6-pro:deepinfra": () =>
        createDeepInfraModelConfig({ model: "XiaomiMiMo/MiMo-V2.6-Pro" }),
    "inclusionai/ling-3.1-flash": () =>
        createNovitaModelConfig({ model: "inclusionai/ling-3.1-flash" }),
    "inclusionai/ling-3.1-flash:vercel:novita": () =>
        createVercelAIGatewayModelConfig({
            model: "inclusionai/ling-3.1-flash",
            directEndpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
            defaultOptions: {
                providerOptions: { gateway: { only: ["novita"] } },
            },
        }),
    "mistral-large-4": () =>
        createMistralModelConfig({
            model: "mistral-large-4",
            directEndpoint: "https://api.mistral.ai/v1/chat/completions",
            useMistralChatFormat: true,
        }),
    "mistral-large-4-vercel": () =>
        createVercelAIGatewayModelConfig({
            model: "mistral/mistral-large-4",
            directEndpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
            defaultOptions: {
                providerOptions: { gateway: { only: ["mistral"] } },
            },
        }),
    // Nex returns a generic server error when it cannot fetch an image URL.
    "nex-agi/nex-n2.5-mini": () => ({
        ...createPinnedOpenRouterConfig(
            "nex-agi/nex-n2.5-mini",
            "nex-agi/bf16",
        )(),
        requiresBase64ImageUrls: true,
    }),
    "nex-agi/nex-n2.5-pro": () => ({
        ...createPinnedOpenRouterConfig(
            "nex-agi/nex-n2.5-pro",
            "nex-agi/fp8",
        )(),
        requiresBase64ImageUrls: true,
    }),
    "inclusionai/ling-3.0-flash-vl": createPinnedOpenRouterConfig(
        "inclusionai/ling-3.0-flash-vl",
        "deepinfra/fp16",
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
            defaultOptions: {
                max_tokens: 64000,
                // The base slug also matches alibaba/us-east-1, which can
                // be priced differently.
                provider: {
                    only: ["Alibaba"],
                    ignore: ["alibaba/us-east-1"],
                    allow_fallbacks: false,
                },
            },
        }),
    "qwen3.7-plus-alibaba": () =>
        createAlibabaModelConfig({
            model: "qwen3.7-plus",
            responsesEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses",
            responsesApiKeyBinding: "DASHSCOPE_API_KEY",
            responsesDisableReasoningForForcedTools: true,
            defaultOptions: { max_tokens: 64000 },
        }),
    "qwen/qwen3.7-max": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3.7-max",
            defaultOptions: {
                max_tokens: 64000,
                provider: {
                    only: ["alibaba"],
                    ignore: ["alibaba/us-east-1", "cloudflare"],
                    allow_fallbacks: false,
                },
            },
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
    "qwen3.8-27b-openrouter-reka": createPinnedOpenRouterConfig(
        "qwen/qwen3.8-27b",
        "reka/fp8",
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
    "qwen3.8-max-alibaba": () =>
        createAlibabaModelConfig({
            model: "qwen3.8-max",
            responsesEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses",
            responsesApiKeyBinding: "DASHSCOPE_API_KEY",
            responsesDisableReasoningForForcedTools: true,
            defaultOptions: { max_tokens: 64000 },
        }),
    "qwen3.8-max-0902": () =>
        createAlibabaModelConfig({
            model: "qwen3.8-max-0902",
            responsesEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses",
            responsesApiKeyBinding: "DASHSCOPE_API_KEY",
            responsesDisableReasoningForForcedTools: true,
            defaultOptions: { max_tokens: 64000 },
        }),
    "qwen/qwen3.7-flash": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3.7-flash",
            defaultOptions: {
                max_tokens: 64000,
                // The base slug also matches alibaba/us-east-1, which costs
                // 15% more than the quoted Alibaba rates.
                provider: {
                    only: ["Alibaba"],
                    ignore: ["alibaba/us-east-1"],
                    allow_fallbacks: false,
                },
            },
        }),
    "qwen3.7-flash-alibaba": () =>
        createAlibabaModelConfig({
            model: "qwen3.7-flash",
            responsesEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses",
            responsesApiKeyBinding: "DASHSCOPE_API_KEY",
            responsesDisableReasoningForForcedTools: true,
            defaultOptions: { max_tokens: 64000 },
        }),
    "qwen/qwen3.8-flash": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3.8-flash",
            defaultOptions: {
                max_tokens: 64000,
                provider: {
                    only: ["Alibaba"],
                    allow_fallbacks: false,
                },
            },
        }),
    "qwen3.8-flash-alibaba": () =>
        createAlibabaModelConfig({
            model: "qwen3.8-flash",
            responsesEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses",
            responsesApiKeyBinding: "DASHSCOPE_API_KEY",
            responsesDisableReasoningForForcedTools: true,
            defaultOptions: { max_tokens: 64000 },
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
    // Reasoning defaults to "high" and burns ~1,300 tokens on even a
    // trivial schema, so a caller relying on the upstream default (no
    // explicit max_tokens) can get finish_reason:"length", content:null
    // under a normal budget. Matches this route's own max_completion_tokens
    // cap. Callers who pass an explicit max_tokens still hit the same gap —
    // resolveModelConfig drops this default the moment one is supplied.
    "tencent/hy4-preview": () =>
        createOpenRouterModelConfig({
            model: "tencent/hy4-preview",
            defaultOptions: {
                max_tokens: 64000,
                provider: {
                    only: ["tencent/fp8"],
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
    // OpenRouter serves Inkling Small only through DeepInfra (fp8).
    "thinkingmachines/inkling-small": () =>
        createOpenRouterModelConfig({
            model: "thinkingmachines/inkling-small",
            defaultOptions: {
                provider: {
                    only: ["deepinfra"],
                    allow_fallbacks: false,
                },
            },
        }),
    "openai/gpt-4o-mini": () => ({
        provider: "openai",
        model: "gpt-4o-mini",
        authKey: textEnvironmentValue("OPENAI_API_KEY"),
        directEndpoint: "https://api.openai.com/v1/chat/completions",
        responsesEndpoint: "https://api.openai.com/v1/responses",
        serviceTier: "default",
    }),
    "gpt-4o-mini-openrouter": () =>
        createOpenRouterModelConfig({
            model: "openai/gpt-4o-mini",
            defaultOptions: {
                provider: {
                    only: ["openai"],
                    ignore: ["cloudflare"],
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
    // Novita's Gemma deployments regressed: 26B rejected most requests with
    // 4xx and 31B's endpoint was degraded. 26B pins DeepInfra FP8, which is
    // text-only on OpenRouter: image requests 404 there and fall back to the
    // direct DeepInfra route. 31B moves to Crusoe BF16 at Novita's former rate.
    "google/gemma-4-26b-a4b-it": createPinnedOpenRouterConfig(
        "google/gemma-4-26b-a4b-it",
        "deepinfra/fp8",
    ),
    "google/gemma-4-31b-it": createPinnedOpenRouterConfig(
        "google/gemma-4-31b-it",
        "crusoe/bf16",
    ),

    // -- Exact-checkpoint text fallbacks -------------------------------------
    "deepseek-ai/DeepSeek-V4-Flash-0731": () =>
        createDeepInfraModelConfig({
            model: "deepseek-ai/DeepSeek-V4-Flash-0731",
            // Reasons only when asked; keep the model's reasoning default.
            defaultOptions: { reasoning_effort: "high" },
        }),
    "deepseek-ai/DeepSeek-V4.1-Flash-1017": () =>
        createDeepInfraModelConfig({
            model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
            // Reasons only when asked; keep the model's reasoning default.
            defaultOptions: { reasoning_effort: "high" },
        }),
    "deepseek-ai/DeepSeek-V4-Flash-Vision-Exp": () =>
        createDeepInfraModelConfig({
            model: "deepseek-ai/DeepSeek-V4-Flash-Vision-Exp",
        }),
    "zai-org/GLM-5.2": () =>
        createDeepInfraModelConfig({ model: "zai-org/GLM-5.2" }),
    "zai-org/GLM-5.3": () =>
        createDeepInfraModelConfig({
            model: "zai-org/GLM-5.3",
            directEndpoint:
                "https://api.deepinfra.com/v1/openai/chat/completions",
            defaultOptions: { max_tokens: 64000 },
        }),
    "meta-models/Muse-Glimmer-30B": () =>
        createDeepInfraModelConfig({ model: "meta-models/Muse-Glimmer-30B" }),
    "Qwen/Qwen3.8-2.4T-A95B": () =>
        createDeepInfraModelConfig({ model: "Qwen/Qwen3.8-2.4T-A95B" }),
    "moonshotai/Kimi-K2.6": () =>
        createDeepInfraModelConfig({ model: "moonshotai/Kimi-K2.6" }),
    "moonshotai/Kimi-K3": () =>
        createDeepInfraModelConfig({ model: "moonshotai/Kimi-K3" }),
    "meta-llama/Llama-3.3-70B-Instruct-Turbo": () =>
        createDeepInfraModelConfig({
            model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        }),
    "google/gemma-4-26B-A4B-it": () =>
        createDeepInfraModelConfig({ model: "google/gemma-4-26B-A4B-it" }),
    "google/gemma-4-31B-it": () =>
        createDeepInfraModelConfig({ model: "google/gemma-4-31B-it" }),
    "mistral-large-direct": () =>
        createMistralModelConfig({ model: "mistral-large-2512" }),
    "claude-opus-4.7-openrouter-vertex": createPinnedOpenRouterConfig(
        "anthropic/claude-opus-4.7",
        "google-vertex/global",
    ),
    "llama-scout-openrouter-deepinfra-priority": createPinnedOpenRouterConfig(
        "meta-llama/llama-4-scout",
        "deepinfra/fp8/priority",
        16384,
    ),
    "llama-scout-openrouter-novita": createPinnedOpenRouterConfig(
        "meta-llama/llama-4-scout",
        "novita/bf16",
        16384,
    ),
    // The base slug "xai" also matches xai/zdr/us and the priority tiers,
    // which bill above the quoted rate, so they are excluded explicitly.
    "grok-4.7-openrouter": () =>
        createOpenRouterModelConfig({
            model: "x-ai/grok-4.7",
            defaultOptions: {
                provider: {
                    only: ["xai"],
                    ignore: ["xai/zdr/us", "xai/priority", "xai/zdr/priority"],
                    allow_fallbacks: false,
                },
            },
        }),
    "grok-openrouter-xai-zdr": createPinnedOpenRouterConfig(
        "x-ai/grok-4.20",
        "xai/zdr",
    ),
    "grok-large-openrouter-xai-zdr": () =>
        createOpenRouterModelConfig({
            model: "x-ai/grok-4.3",
            defaultOptions: {
                provider: {
                    only: ["xai/zdr"],
                    ignore: ["xai/zdr/priority", "cloudflare"],
                    allow_fallbacks: false,
                },
            },
        }),
    "claude-fast-openrouter-vertex": createPinnedOpenRouterConfig(
        "anthropic/claude-haiku-4.5",
        "google-vertex/global",
    ),
    "claude-opus-5.5-fast-vercel": () =>
        createVercelAIGatewayModelConfig({
            model: "anthropic/claude-opus-5.5-fast",
            directEndpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
            defaultOptions: {
                providerOptions: { gateway: { only: ["anthropic"] } },
            },
        }),
    "claude-opus-5.5-fast-openrouter-anthropic-fast":
        createPinnedOpenRouterConfig(
            "anthropic/claude-opus-5.5",
            "anthropic/fast",
        ),
    "claude-fable-5-openrouter-vertex": createPinnedOpenRouterConfig(
        "anthropic/claude-fable-5",
        "google-vertex/global",
    ),
    "muse-glimmer-openrouter-together": createPinnedOpenRouterConfig(
        "meta/muse-glimmer-30b",
        "together",
    ),
    "meta/muse-wonder-1.0": createPinnedOpenRouterConfig(
        "meta/muse-wonder",
        "meta",
    ),
    "nemotron-3.5-lightning-openrouter-coreweave": createPinnedOpenRouterConfig(
        "nvidia/nemotron-3.5-lightning",
        "coreweave/bf16",
    ),
    "nvidia/NVIDIA-Nemotron-3.5-Super-VL": () =>
        createDeepInfraModelConfig({
            model: "nvidia/NVIDIA-Nemotron-3.5-Super-VL",
        }),
    "nemotron-3.5-super-vl-openrouter-together": createPinnedOpenRouterConfig(
        "nvidia/nemotron-3.5-super-vl",
        "together",
    ),
    "gemini-3-flash-openrouter-vertex-global":
        createPinnedOpenRouterGeminiConfig(
            "gemini-3-flash-preview",
            "google-vertex/global",
        ),
    "gemini-openrouter-vertex-global": createPinnedOpenRouterGeminiConfig(
        "gemini-3.7-flash",
        "google-vertex/global",
    ),
    "gemini-3.8-openrouter-vertex-global": createPinnedOpenRouterGeminiConfig(
        "gemini-3.8-flash",
        "google-vertex/global",
    ),
    // The base slug "google-ai-studio" also matches its priority tier (1.8x the
    // rate) and its flex tier, so both are excluded explicitly.
    "gemini-4-argon-openrouter-ai-studio": () =>
        createOpenRouterModelConfig({
            model: "google/gemini-4-argon",
            defaultOptions: {
                provider: {
                    only: ["google-ai-studio"],
                    ignore: [
                        "google-ai-studio/priority",
                        "google-ai-studio/flex",
                    ],
                    allow_fallbacks: false,
                },
            },
        }),
    "gemini-fast-openrouter-ai-studio": createPinnedOpenRouterGeminiConfig(
        "gemini-2.5-flash-lite",
        "google-ai-studio",
    ),
    "google/gemini-2.5-flash-lite:search": () => ({
        ...createPinnedOpenRouterGeminiConfig(
            "gemini-2.5-flash-lite",
            "google-ai-studio",
        )(),
        responsesEndpoint: undefined,
    }),
    "gemini-flash-lite-3.5-openrouter-vertex-global":
        createPinnedOpenRouterGeminiConfig(
            "gemini-3.5-flash-lite",
            "google-vertex/global",
        ),
    "gemini-large-openrouter-vertex-global": createPinnedOpenRouterGeminiConfig(
        "gemini-3.1-pro-preview",
        "google-vertex/global",
    ),
    "qwen-vision-pro-openrouter-novita": createPinnedOpenRouterConfig(
        "qwen/qwen3-vl-235b-a22b-thinking",
        "novita/bf16",
    ),
    "z-ai/glm-5.3-flashx": createPinnedOpenRouterConfig(
        "z-ai/glm-5.3-flashx",
        "z-ai/fp8",
    ),
    "glm-5.3-flash-openrouter": () =>
        createOpenRouterModelConfig({
            model: "z-ai/glm-5.3-flash",
            defaultOptions: {
                max_tokens: 64000,
                provider: {
                    only: [
                        "together",
                        "baseten/fp8",
                        "modal/nvfp4",
                        "crusoe/fp4",
                        "friendli",
                        "digitalocean",
                        "parasail/fp4",
                        "venice",
                    ],
                    allow_fallbacks: true,
                },
            },
        }),
    "glm-5.3-openrouter-friendli": createPinnedOpenRouterConfig(
        "z-ai/glm-5.3",
        "friendli",
    ),
    "kimi-code-openrouter-moonshot": createPinnedOpenRouterConfig(
        "moonshotai/kimi-k2.7-code",
        "inceptron/int4",
    ),
    // StreamLake cannot fetch remote image URLs.
    "kimi-code-openrouter-streamlake": () => ({
        ...createPinnedOpenRouterConfig(
            "moonshotai/kimi-k2.7-code",
            "streamlake",
        )(),
        requiresBase64ImageUrls: true,
    }),
    "glm-5.2-openrouter-zai": createPinnedOpenRouterConfig(
        "z-ai/glm-5.2",
        "z-ai/fp8",
    ),
    // The base slug "alibaba" also matches alibaba/us-east-1, whose peak rate
    // is above the quoted one, so it is excluded explicitly.
    "deepseek-v4-pro-openrouter-alibaba": () =>
        createOpenRouterModelConfig({
            model: "deepseek/deepseek-v4-pro-0813",
            defaultOptions: {
                provider: {
                    only: ["alibaba"],
                    ignore: ["alibaba/us-east-1"],
                    allow_fallbacks: false,
                },
            },
        }),
    "deepseek-v4-pro-openrouter-streamlake": createPinnedOpenRouterConfig(
        "deepseek/deepseek-v4-pro-0813",
        "streamlake",
    ),
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
    "inception/mercury-3": createPinnedOpenRouterConfig(
        "inception/mercury-3",
        "Inception",
        131072,
    ),

    // -- Fireworks AI (DeepSeek) ---------------------------------------------
    "accounts/fireworks/models/deepseek-v4p1-flash": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/deepseek-v4p1-flash",
        }),

    // -- Fireworks AI (DeepSeek V4.1 Flash 1017) -----------------------------
    "accounts/fireworks/models/deepseek-v4p1-flash-1017": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/deepseek-v4p1-flash-1017",
        }),

    // -- Fireworks AI (Kimi, GLM, Qwen) --------------------------------------
    "accounts/fireworks/models/kimi-k3": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/kimi-k3",
        }),
    "accounts/fireworks/models/qwen3p8-2p4t-a95b": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/qwen3p8-2p4t-a95b",
        }),

    // -- Mistral Small ---------------------------------------------------------
    // Moved off Azure: Mistral Small was Marketplace SaaS pass-through on
    // Azure (not credit-eligible). Bumped the 2503 alias from 3.1 → 3.2 since
    // OpenRouter 3.2 is ~37% cheaper than the Azure 3.1 we were paying.
    "mistral-small-2503": createPinnedOpenRouterConfig(
        "mistralai/mistral-small-3.2-24b-instruct",
        "deepinfra/fp8",
    ),
    "mistral-small-3.2-deepinfra": () =>
        createDeepInfraModelConfig({
            model: "mistralai/Mistral-Small-3.2-24B-Instruct-2506",
        }),
    "mistral-small-2603": () =>
        createMistralModelConfig({
            model: "mistral-small-2603",
            defaultOptions: { max_tokens: 64000 },
        }),
    "mistral-small-2603-openrouter": () =>
        createOpenRouterModelConfig({
            model: "mistralai/mistral-small-2603",
            defaultOptions: {
                max_tokens: 64000,
                provider: {
                    only: ["mistral/zdr"],
                    ignore: ["mistral/eu", "mistral/us", "cloudflare"],
                    allow_fallbacks: false,
                },
            },
        }),

    // -- Azure (Myceli Prod — eastus, Mistral Large) -------------------------
    "Mistral-Large-3": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Mistral-Large-3/chat/completions?api-version=2024-12-01-preview",
        ),

    // -- Claude via Anthropic and AWS Bedrock ---------------------------------
    "claude-sonnet-4-6": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-sonnet-4-6",
            defaultOptions: { max_tokens: 64000 },
        }),
    "anthropic/claude-sonnet-5.5": () =>
        createAnthropicConfig({
            model: "claude-sonnet-5-5",
            defaultOptions: { max_tokens: 128000 },
        }),
    "anthropic/claude-sonnet-5.5:aws": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-sonnet-5-5",
            defaultOptions: { max_tokens: 128000 },
        }),
    "anthropic/claude-haiku-5.5": () =>
        createAnthropicConfig({
            model: "claude-haiku-5-5",
            defaultOptions: { max_tokens: 128000 },
        }),
    "anthropic/claude-haiku-5.5:aws": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-haiku-5-5",
            defaultOptions: { max_tokens: 128000 },
        }),
    "claude-sonnet-5": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-sonnet-5",
            defaultOptions: { max_tokens: 64000 },
        }),
    "anthropic/claude-sonnet-5:anthropic": () =>
        createAnthropicConfig({
            model: "claude-sonnet-5",
            defaultOptions: { max_tokens: 64000 },
        }),
    "claude-opus-4-6": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-opus-4-6-v1",
            defaultOptions: { max_tokens: 128000 },
        }),
    "claude-opus-4-7": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-opus-4-7",
            defaultOptions: { max_tokens: 128000 },
        }),
    "claude-opus-5": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-opus-5",
            defaultOptions: { max_tokens: 128000 },
        }),
    "anthropic/claude-opus-5:anthropic": () =>
        createAnthropicConfig({
            model: "claude-opus-5",
            defaultOptions: { max_tokens: 128000 },
        }),
    "anthropic/claude-opus-5.5": () =>
        createAnthropicConfig({
            model: "claude-opus-5-5",
            defaultOptions: { max_tokens: 128000 },
        }),
    "anthropic/claude-opus-5.5:aws": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-opus-5-5",
            defaultOptions: { max_tokens: 128000 },
        }),
    "claude-fable-5": () =>
        createBedrockNativeConfig({
            model: "global.anthropic.claude-fable-5",
            defaultOptions: { max_tokens: 128000 },
        }),
    "anthropic/claude-fable-5.1": () =>
        createAnthropicConfig({
            model: "claude-fable-5-1",
            defaultOptions: { max_tokens: 128000 },
        }),
    "anthropic/claude-fable-5.1:aws": () =>
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

    // -- AWS Bedrock (Qwen) ---------------------------------------------------
    "qwen-coder-openrouter": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3-coder-30b-a3b-instruct",
            // Preserve the existing Chat-based Responses adapter.
            responsesEndpoint: undefined,
            defaultOptions: {
                provider: {
                    only: ["siliconflow/fp8"],
                    ignore: ["cloudflare"],
                    allow_fallbacks: false,
                },
            },
        }),
    "qwen-coder-bedrock": () =>
        createBedrockNativeConfig({ model: "qwen.qwen3-coder-30b-a3b-v1:0" }),

    // -- Google Vertex AI (Gemini) -------------------------------------------
    "google/gemini-3-flash-preview": createVertexGeminiConfig(
        "gemini-3-flash-preview",
        "global",
    ),
    "google/gemini-3.1-pro-preview": createVertexGeminiConfig(
        "gemini-3.1-pro-preview",
        "global",
    ),
    "google/gemini-2.5-flash-lite": () =>
        createVercelAIGatewayModelConfig({
            model: "google/gemini-2.5-flash-lite",
            responsesEndpoint: undefined,
            directEndpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
            defaultOptions: {
                providerOptions: { gateway: { only: ["google"] } },
            },
        }),
    "google/gemini-2.5-flash-lite:search:vercel": () =>
        portkeyConfig["google/gemini-2.5-flash-lite"](),
    "google/gemini-3.5-flash-lite": createVertexGeminiConfig(
        "gemini-3.5-flash-lite",
        "global",
    ),
    "google/gemini-3.7-flash": createVertexGeminiConfig(
        "gemini-3.7-flash",
        "global",
    ),
    "google/gemini-3.8-flash": createVertexGeminiConfig(
        "gemini-3.8-flash",
        "global",
    ),
    "google/gemini-4-argon": createVertexGeminiConfig(
        "gemini-4-argon",
        "global",
    ),

    // Dedicated Gemini Search services use the same direct Vertex adapter.
    "vertex/gemini-3.5-flash-lite": createVertexGeminiConfig(
        "gemini-3.5-flash-lite",
        "global",
    ),
    "vertex/gemini-3.6-flash": createVertexGeminiConfig(
        "gemini-3.6-flash",
        "global",
    ),

    // -- Perplexity -----------------------------------------------------------
    // The Sonar transform turns the caller's search options into web_search
    // tool settings.
    "perplexity/sonar": (options?: TransformOptions) =>
        createPerplexityAgentConfig(
            "perplexity/sonar",
            options?.perplexityWebSearch,
        ),

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
    "MiniMaxAI/MiniMax-M3": () =>
        createDeepInfraModelConfig({ model: "MiniMaxAI/MiniMax-M3" }),
    "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
        }),
    "accounts/fireworks/models/nemotron-3-ultra-nvfp4": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/nemotron-3-ultra-nvfp4",
        }),
    "accounts/fireworks/models/inkling": () =>
        createFireworksModelConfig({
            model: "accounts/fireworks/models/inkling",
        }),

    // -- Vercel AI Gateway (Meta) --------------------------------------------
    "meta/llama-4-scout": () =>
        createVercelAIGatewayModelConfig({
            model: "meta/llama-4-scout",
            directEndpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
            defaultOptions: {
                max_tokens: 16384,
                providerOptions: { gateway: { only: ["deepinfra"] } },
            },
        }),
    "meta/muse-spark-1.2": () =>
        createVercelAIGatewayModelConfig({
            model: "meta/muse-spark-1.2",
        }),
    "meta/muse-spark-1.3": () =>
        createVercelAIGatewayModelConfig({
            model: "meta/muse-spark-1.3",
        }),
    "meta/muse-wonder-1.0:vercel": () =>
        createVercelAIGatewayModelConfig({
            model: "meta/muse-wonder-1.0",
        }),

    // -- Azure (Myceli Prod — eastus, Meta Llama) ----------------------------
    "Llama-3.3-70B-Instruct": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Llama-3.3-70B-Instruct/chat/completions?api-version=2024-12-01-preview",
        ),
    "Llama-4-Maverick-17B-128E-Instruct-FP8": () =>
        createAzureResponsesModelConfig(
            textEnvironmentValue("AZURE_MYCELI_PROD_API_KEY"),
            "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/Llama-4-Maverick-17B-128E-Instruct-FP8/chat/completions?api-version=2024-12-01-preview",
            { requiresBase64ImageUrls: true },
        ),
    // -- OpenRouter (Qwen Coder, Qwen VL) -------------------------------------
    // Exact provider pins keep OpenRouter routing and billing deterministic.
    "qwen/qwen3-coder-next": createPinnedOpenRouterConfig(
        "qwen/qwen3-coder-next",
        "parasail/bf16",
    ),
    "qwen/qwen3-vl-30b-a3b-instruct": () =>
        createDeepInfraModelConfig({
            model: "Qwen/Qwen3-VL-30B-A3B-Instruct",
            directEndpoint:
                "https://api.deepinfra.com/v1/openai/chat/completions",
        }),
    "qwen3-vl-30b-openrouter": () =>
        createOpenRouterModelConfig({
            model: "qwen/qwen3-vl-30b-a3b-instruct",
            defaultOptions: {
                provider: {
                    only: ["deepinfra/fp8"],
                    ignore: ["deepinfra/fp8/priority", "cloudflare"],
                    allow_fallbacks: false,
                },
            },
        }),
    "qwen3-vl-235b-a22b-thinking": () =>
        createAlibabaModelConfig({
            model: "qwen3-vl-235b-a22b-thinking",
        }),

    // -- OpenRouter (StepFun) -------------------------------------------------
    "stepfun/step-3.5-flash": () =>
        createOpenRouterModelConfig({
            model: "stepfun/step-3.5-flash",
        }),
    // Pinned to StepFun's own endpoint; other OpenRouter endpoints differ in
    // cache price, precision or context.
    "stepfun/step-5-preview": () =>
        createOpenRouterModelConfig({
            model: "stepfun/step-5-preview",
            defaultOptions: {
                provider: { only: ["stepfun/fp8"], allow_fallbacks: false },
            },
        }),
    // Vercel's StepFun endpoint has no tools and Tencent caps output at 64K.
    "stepfun/step-5-preview:vercel": () =>
        createVercelAIGatewayModelConfig({
            model: "stepfun/step-5-preview",
            defaultOptions: {
                providerOptions: { gateway: { only: ["deepinfra"] } },
            },
        }),

    // -- Novita and Vercel (StepFun) ------------------------------------------
    "stepfun/step-3.7-flash": () =>
        createNovitaModelConfig({ model: "stepfun/step-3.7-flash" }),
    // Pin StepFun's own endpoint: DeepInfra serves MiMo under this model's id.
    "stepfun/step-3.7-flash:vercel": () =>
        createVercelAIGatewayModelConfig({
            model: "stepfun/step-3.7-flash",
            responsesEndpoint: undefined,
            directEndpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
            defaultOptions: {
                providerOptions: { gateway: { only: ["stepfun"] } },
            },
        }),

    // -- InferencePort (Lightning routers) ------------------------------------
    // "lightning" is the router id that `lightning-text-v2` aliases.
    "inferenceport-lightning-text-v2": () =>
        createInferencePortModelConfig({ model: "lightning" }),
    "inferenceport-lightning-text-v2.1": () =>
        createInferencePortModelConfig({ model: "lightning-text-v2.1" }),

    // -- OVHcloud -------------------------------------------------------------
    "gpt-oss-20b": () =>
        createOVHcloudOAIConfig({
            model: "gpt-oss-20b",
            "max-tokens": 1500,
            responsesEndpoint:
                "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/responses",
        }),
    "Qwen3Guard-Gen-8B": () =>
        createOVHcloudOAIConfig({ model: "Qwen3Guard-Gen-8B" }),
};
