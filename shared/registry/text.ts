import { COST_START_DATE, perMillion } from "./price-helpers";
import type { ServiceDefinition } from "./registry";

// Voices available for openai-audio model - exported for schema validation
export const AUDIO_VOICES = [
    "alloy",
    "echo",
    "fable",
    "onyx",
    "nova",
    "shimmer",
    "coral",
    "verse",
    "ballad",
    "ash",
    "sage",
    "amuch",
    "dan",
] as const;

export type AudioVoice = (typeof AUDIO_VOICES)[number];

export const DEFAULT_TEXT_MODEL = "gpt-5-mini" as const;
export type TextServiceId = keyof typeof TEXT_SERVICES;
export type TextModelId = (typeof TEXT_SERVICES)[TextServiceId]["modelId"];

export const TEXT_SERVICES = {
    "gpt-5-mini": {
        aliases: ["openai"],
        modelId: "gpt-4o-mini", // Azure actual model ID (using gpt-4o-mini as the default)
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.15),
                promptCachedTokens: perMillion(0.04),
                completionTextTokens: perMillion(0.6),
            },
        ],
        description: "OpenAI GPT-5 Mini - Fast & Balanced",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "gpt-5-nano": {
        aliases: ["openai-fast", "gpt-5-nano-2025-08-07"],
        modelId: "gpt-4o-mini", // Azure actual model ID
        provider: "azure-2",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.06),
                promptCachedTokens: perMillion(0.01),
                completionTextTokens: perMillion(0.44),
            },
        ],
        description: "OpenAI GPT-5 Nano - Ultra Fast & Affordable",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "gpt-5.2": {
        aliases: ["openai-large", "openai-reasoning", "gpt-5.2-reasoning"],
        modelId: "gpt-4o", // Azure actual model ID (using gpt-4o as the "large" model)
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.5),
                promptCachedTokens: perMillion(1.25),
                completionTextTokens: perMillion(10.0),
            },
        ],
        description: "OpenAI GPT-5.2 - Most Powerful & Intelligent",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        isSpecialized: false,
    },
    "qwen-coder": {
        aliases: ["qwen2.5-coder-32b-instruct"],
        modelId: "qwen3-coder-30b-a3b-instruct",
        provider: "scaleway",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.9),
                completionTextTokens: perMillion(0.9),
            },
        ],
        description: "Qwen 2.5 Coder 32B - Specialized for Code Generation",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "mistral-small": {
        aliases: [
            "mistral",
            "mistral-small-3.2",
            "mistral-small-3.2-24b-instruct-2506",
        ],
        modelId: "mistral-small-3.2-24b-instruct-2506",
        provider: "scaleway",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.15),
                completionTextTokens: perMillion(0.35),
            },
        ],
        description: "Mistral Small 3.2 24B - Efficient & Cost-Effective",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "gpt-4o-mini-audio": {
        aliases: [
            "openai-audio",
            "gpt-4o-mini-audio-preview",
            "gpt-4o-mini-audio-preview-2024-12-17",
        ],
        modelId: "gpt-4o-realtime-preview", // Azure actual model ID for audio
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(5.0),
                completionTextTokens: perMillion(20.0),
                promptAudioTokens: perMillion(11.0),
                completionAudioTokens: perMillion(22.0),
            },
        ],
        description: "OpenAI GPT-4o Realtime Audio - Voice Input & Output",
        voices: [...AUDIO_VOICES],
        inputModalities: ["text", "image", "audio"],
        outputModalities: ["audio", "text"],
        tools: true,
        isSpecialized: false,
    },
    "gemini-3-flash": {
        aliases: ["gemini", "gemini-3-flash-preview"],
        modelId: "gemini-3-flash-preview",
        provider: "google",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.5),
                promptCachedTokens: perMillion(0.05),
                promptAudioTokens: perMillion(0.5), // Audio billed at same rate as text
                completionTextTokens: perMillion(3.0),
            },
        ],
        description:
            "Google Gemini 3 Flash - Pro-Grade Reasoning at Flash Speed",
        inputModalities: ["text", "image", "audio", "video"],
        outputModalities: ["text"],
        tools: true,
        search: true,
        codeExecution: true,
        isSpecialized: false,
    },
    "gemini-2.5-flash-lite": {
        aliases: ["gemini-fast"],
        modelId: "gemini-2.5-flash-lite",
        provider: "google",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.1),
                promptCachedTokens: perMillion(0.01),
                promptAudioTokens: perMillion(0.1), // Audio billed at same rate as text
                completionTextTokens: perMillion(0.4),
            },
        ],
        description:
            "Google Gemini 2.5 Flash Lite - Ultra Fast & Cost-Effective",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        search: true,
        codeExecution: true,
        isSpecialized: false,
    },
    "deepseek-v3": {
        aliases: ["deepseek", "deepseek-reasoning"],
        modelId: "deepseek-v3.2",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.58),
                completionTextTokens: perMillion(1.68),
            },
        ],
        description: "DeepSeek V3.2 - Efficient Reasoning & Agentic AI",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        isSpecialized: false,
    },
    "grok-4-fast": {
        aliases: ["grok", "grok-fast", "grok-4"],
        modelId: "grok-4-fast-non-reasoning",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.2),
                promptCachedTokens: perMillion(0.2), // Azure doesn't discount cached tokens for third-party models
                completionTextTokens: perMillion(0.5),
            },
        ],
        description: "xAI Grok 4 Fast - High Speed & Real-Time",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "gemini-3-flash-search": {
        aliases: ["gemini-search"],
        modelId: "gemini-3-flash-preview",
        provider: "google",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.5),
                promptCachedTokens: perMillion(0.05),
                promptAudioTokens: perMillion(0.5), // Audio billed at same rate as text
                completionTextTokens: perMillion(3.0),
            },
        ],
        description: "Google Gemini 3 Flash - With Google Search",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: false,
        search: true,
        codeExecution: true,
        isSpecialized: false,
    },
    "chickytutor": {
        aliases: [],
        modelId: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.8),
                completionTextTokens: perMillion(4.0),
            },
        ],
        description: "ChickyTutor AI Language Tutor - (chickytutor.com)",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: true,
    },
    "midijourney": {
        aliases: [],
        modelId: "gpt-4.1-2025-04-14",
        provider: "azure-2",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.2),
                promptCachedTokens: perMillion(0.55),
                completionTextTokens: perMillion(8.8),
            },
        ],
        description: "MIDIjourney - AI Music Composition Assistant",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: true,
    },
    "claude-haiku-4.5": {
        aliases: ["claude-fast", "claude-haiku"],
        modelId: "anthropic.claude-haiku-4-5-20251001-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.0),
                completionTextTokens: perMillion(5.0),
            },
        ],
        description: "Anthropic Claude Haiku 4.5 - Fast & Intelligent",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-sonnet-4.5": {
        aliases: ["claude", "claude-sonnet"],
        modelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(3.0),
                completionTextTokens: perMillion(15.0),
            },
        ],
        description: "Anthropic Claude Sonnet 4.5 - Most Capable & Balanced",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-opus-4.5": {
        aliases: ["claude-large", "claude-opus"],
        modelId: "anthropic.claude-opus-4-5-20251101-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(5.0),
                completionTextTokens: perMillion(25.0),
            },
        ],
        description: "Anthropic Claude Opus 4.5 - Most Intelligent Model",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "sonar": {
        aliases: ["perplexity-fast"],
        modelId: "sonar",
        provider: "perplexity",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.0),
                completionTextTokens: perMillion(1.0),
            },
        ],
        description: "Perplexity Sonar - Fast & Affordable with Web Search",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: false,
        search: true,
        isSpecialized: false,
    },
    "sonar-reasoning": {
        aliases: ["perplexity-reasoning"],
        modelId: "sonar-reasoning",
        provider: "perplexity",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.0),
                completionTextTokens: perMillion(5.0),
            },
        ],
        description:
            "Perplexity Sonar Reasoning - Advanced Reasoning with Web Search",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: false,
        reasoning: true,
        search: true,
        isSpecialized: false,
    },
    "kimi-k2-thinking": {
        aliases: ["kimi-k2", "kimi-thinking"],
        modelId: "moonshotai/kimi-k2-thinking-maas",
        provider: "google",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.6),
                completionTextTokens: perMillion(2.5),
            },
        ],
        description:
            "Moonshot Kimi K2 Thinking - Deep Reasoning & Tool Orchestration",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        isSpecialized: false,
    },
    "gemini-3-pro": {
        aliases: ["gemini-large", "gemini-3", "gemini-3-pro-preview"],
        modelId: "gemini-3-pro-preview",
        provider: "google",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.0),
                promptCachedTokens: perMillion(0.2), // 10% of input price (same ratio as other Gemini models)
                completionTextTokens: perMillion(12.0),
            },
        ],
        description:
            "Google Gemini 3 Pro - Most Intelligent Model with 1M Context (Preview)",
        inputModalities: ["text", "image", "audio", "video"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        search: true,
        codeExecution: false, // Disabled - was breaking gemini-large
        isSpecialized: false,
    },
    "nova-micro": {
        aliases: ["amazon-nova-micro", "nova"],
        modelId: "amazon.nova-micro-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.035),
                completionTextTokens: perMillion(0.14),
            },
        ],
        description: "Amazon Nova Micro - Ultra Fast & Ultra Cheap",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    // Legacy models - older versions still accessible
    "gpt-5.1": {
        aliases: ["gpt-5.1-2025-03-15"],
        modelId: "gpt-5.1", // Azure actual model ID
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.0),
                promptCachedTokens: perMillion(0.1),
                completionTextTokens: perMillion(8.0),
            },
        ],
        description: "OpenAI GPT-5.1 - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "gpt-5": {
        aliases: ["gpt-5-2025-01-20"],
        modelId: "gpt-4o-2024-08-06", // Azure actual model ID
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.8),
                promptCachedTokens: perMillion(0.08),
                completionTextTokens: perMillion(5.0),
            },
        ],
        description: "OpenAI GPT-5 - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "gpt-4o": {
        aliases: ["gpt-4o-2024-08-06"],
        modelId: "gpt-4o-2024-08-06", // Azure actual model ID
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.5),
                promptCachedTokens: perMillion(1.25),
                completionTextTokens: perMillion(10.0),
            },
        ],
        description: "OpenAI GPT-4o - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "gpt-4o-mini": {
        aliases: ["gpt-4o-mini-2024-07-18"],
        modelId: "gpt-4o-mini-2024-07-18", // Azure actual model ID
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.15),
                promptCachedTokens: perMillion(0.075),
                completionTextTokens: perMillion(0.6),
            },
        ],
        description: "OpenAI GPT-4o Mini - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "gpt-4-turbo": {
        aliases: ["gpt-4-turbo-2024-04-09"],
        modelId: "gpt-4-turbo-2024-04-09", // Azure actual model ID (or gpt-4)
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(10.0),
                completionTextTokens: perMillion(30.0),
            },
        ],
        description: "OpenAI GPT-4 Turbo - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "gpt-4": {
        aliases: ["gpt-4-0613"],
        modelId: "gpt-4", // Azure actual model ID (short form)
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(30.0),
                completionTextTokens: perMillion(60.0),
            },
        ],
        description: "OpenAI GPT-4 - Original (Legacy)",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-opus-4.1": {
        aliases: ["claude-4.1-opus"],
        modelId: "anthropic.claude-opus-4-1-20250805-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(15.0),
                completionTextTokens: perMillion(75.0),
            },
        ],
        description: "Anthropic Claude Opus 4.1 - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-opus-4": {
        aliases: ["claude-4-opus"],
        modelId: "anthropic.claude-opus-4-20250514-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(15.0),
                completionTextTokens: perMillion(75.0),
            },
        ],
        description: "Anthropic Claude Opus 4 - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-sonnet-4": {
        aliases: ["claude-4-sonnet"],
        modelId: "anthropic.claude-sonnet-4-20250514-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(3.0),
                completionTextTokens: perMillion(15.0),
            },
        ],
        description: "Anthropic Claude Sonnet 4 - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-haiku-4": {
        aliases: ["claude-4-haiku"],
        modelId: "anthropic.claude-haiku-4-20250514-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.8),
                completionTextTokens: perMillion(4.0),
            },
        ],
        description: "Anthropic Claude Haiku 4 - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-3.7-sonnet": {
        aliases: ["claude-3-7-sonnet"],
        modelId: "anthropic.claude-3-7-sonnet-20250219-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(3.0),
                completionTextTokens: perMillion(15.0),
            },
        ],
        description:
            "Anthropic Claude 3.7 Sonnet - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-3.5-sonnet-v2": {
        aliases: ["claude-3-5-sonnet-v2"],
        modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(3.0),
                completionTextTokens: perMillion(15.0),
            },
        ],
        description:
            "Anthropic Claude 3.5 Sonnet v2 - Previous Version (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-3.5-sonnet": {
        aliases: ["claude-3-5-sonnet"],
        modelId: "anthropic.claude-3-5-sonnet-20241022-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(3.0),
                completionTextTokens: perMillion(15.0),
            },
        ],
        description: "Anthropic Claude 3.5 Sonnet - Previous Version (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-3-opus": {
        aliases: ["claude-3-opus-20240307"],
        modelId: "anthropic.claude-3-opus-20240307-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(15.0),
                completionTextTokens: perMillion(75.0),
            },
        ],
        description: "Anthropic Claude 3 Opus - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-3-sonnet": {
        aliases: ["claude-3-sonnet-20240307"],
        modelId: "anthropic.claude-3-sonnet-20240307-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(3.0),
                completionTextTokens: perMillion(15.0),
            },
        ],
        description: "Anthropic Claude 3 Sonnet - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "claude-3-haiku": {
        aliases: ["claude-3-haiku-20240307"],
        modelId: "anthropic.claude-3-haiku-20240307-v1:0",
        provider: "aws",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.25),
                completionTextTokens: perMillion(1.25),
            },
        ],
        description: "Anthropic Claude 3 Haiku - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "gemini-2.0-flash": {
        aliases: ["gemini-2-flash-exp"],
        modelId: "gemini-2.0-flash-exp-0111",
        provider: "google",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.4),
                promptCachedTokens: perMillion(0.04),
                completionTextTokens: perMillion(1.6),
            },
        ],
        description: "Google Gemini 2.0 Flash - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "gemini-1.5-pro": {
        aliases: ["gemini-pro"],
        modelId: "gemini-1.5-pro-002",
        provider: "google",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.25),
                promptCachedTokens: perMillion(0.3125),
                completionTextTokens: perMillion(5.0),
            },
        ],
        description: "Google Gemini 1.5 Pro - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
} as const satisfies Record<string, ServiceDefinition<string>>;
