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

export const DEFAULT_TEXT_MODEL = "openai" as const;
export type TextServiceId = keyof typeof TEXT_SERVICES;
export type TextModelId = (typeof TEXT_SERVICES)[TextServiceId]["modelId"];

export const TEXT_SERVICES = {
    "openai": {
        aliases: [],
        modelId: "gpt-5-mini",
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
    "openai-fast": {
        aliases: ["gpt-5-nano", "gpt-5-nano-2025-08-07"],
        modelId: "gpt-5-nano-2025-08-07",
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
    "openai-large": {
        aliases: ["gpt-5.2", "openai-reasoning", "gpt-5.2-reasoning"],
        modelId: "gpt-5.2-2025-12-11",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.75),
                promptCachedTokens: perMillion(0.175),
                completionTextTokens: perMillion(14.0),
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
        aliases: ["qwen3-coder", "qwen3-coder-30b-a3b-instruct"],
        modelId: "qwen3-coder-30b-a3b-instruct",
        provider: "ovhcloud",
        cost: [
            {
                date: new Date("2026-01-05").getTime(),
                promptTextTokens: perMillion(0.06),
                completionTextTokens: perMillion(0.22),
            },
        ],
        description: "Qwen3 Coder 30B - Specialized for Code Generation",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: false,
    },
    "mistral": {
        aliases: [
            "mistral-small",
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
    "openai-audio": {
        aliases: [
            "gpt-4o-mini-audio-preview",
            "gpt-4o-mini-audio-preview-2024-12-17",
        ],
        modelId: "gpt-4o-mini-audio-preview-2024-12-17",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.165),
                completionTextTokens: perMillion(0.66),
                promptAudioTokens: perMillion(11.0),
                completionAudioTokens: perMillion(22.0),
            },
        ],
        description: "OpenAI GPT-4o Mini Audio - Voice Input & Output",
        voices: [...AUDIO_VOICES],
        inputModalities: ["text", "image", "audio"],
        outputModalities: ["audio", "text"],
        tools: true,
        isSpecialized: false,
    },
    "gemini": {
        aliases: ["gemini-3-flash", "gemini-3-flash-preview"],
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
    "gemini-fast": {
        aliases: ["gemini-2.5-flash-lite"],
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
    "deepseek": {
        aliases: ["deepseek-v3", "deepseek-reasoning"],
        modelId: "accounts/fireworks/models/deepseek-v3p2",
        provider: "fireworks",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.56),
                promptCachedTokens: perMillion(0.28),
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
    "grok": {
        aliases: ["grok-fast", "grok-4", "grok-4-fast"],
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
    "gemini-search": {
        aliases: ["gemini-3-flash-search"],
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
    "claude-fast": {
        aliases: ["claude-haiku-4.5", "claude-haiku"],
        modelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
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
    "claude": {
        aliases: ["claude-sonnet-4.5", "claude-sonnet"],
        modelId: "claude-sonnet-4-5-20250929",
        provider: "google",
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
    "claude-large": {
        aliases: ["claude-opus-4.5", "claude-opus"],
        modelId: "claude-opus-4-5-20251101",
        provider: "google",
        paidOnly: true,
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
    "perplexity-fast": {
        aliases: ["sonar"],
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
    "perplexity-reasoning": {
        aliases: ["sonar-reasoning", "sonar-reasoning-pro"],
        modelId: "sonar-reasoning-pro",
        provider: "perplexity",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.0),
                completionTextTokens: perMillion(8.0),
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
    "kimi": {
        aliases: ["kimi-k2.5", "kimi-k2p5", "kimi-reasoning", "kimi-large"],
        modelId: "accounts/fireworks/models/kimi-k2p5",
        provider: "fireworks",
        cost: [
            {
                date: new Date("2026-01-28").getTime(),
                promptTextTokens: perMillion(0.6),
                promptCachedTokens: perMillion(0.1),
                completionTextTokens: perMillion(3.0),
            },
        ],
        description:
            "Moonshot Kimi K2.5 - Flagship Agentic Model with Vision & Multi-Agent",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextWindow: 256000,
        isSpecialized: false,
    },
    "gemini-large": {
        aliases: ["gemini-3-pro", "gemini-3", "gemini-3-pro-preview"],
        modelId: "gemini-3-pro-preview",
        provider: "google",
        paidOnly: true,
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
    "gemini-legacy": {
        aliases: ["gemini-2.5-pro"],
        modelId: "gemini-2.5-pro",
        provider: "google",
        paidOnly: true,
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.25),
                promptCachedTokens: perMillion(0.31), // ~25% of input price
                completionTextTokens: perMillion(10.0),
            },
        ],
        description:
            "Google Gemini 2.5 Pro - Stable Reasoning Model with 1M Context",
        inputModalities: ["text", "image", "audio", "video"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        search: true,
        codeExecution: true,
        isSpecialized: false,
    },
    "nova-fast": {
        aliases: ["amazon-nova-micro", "nova", "nova-micro"],
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
    "glm": {
        aliases: ["glm-4.7", "glm-4p7"],
        modelId: "accounts/fireworks/models/glm-4p7",
        provider: "fireworks",
        cost: [
            {
                date: new Date("2026-01-05").getTime(),
                promptTextTokens: perMillion(0.6),
                promptCachedTokens: perMillion(0.3),
                completionTextTokens: perMillion(2.2),
            },
        ],
        description: "Z.ai GLM-4.7 - Coding, Reasoning & Agentic Workflows",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextWindow: 198000,
        isSpecialized: false,
    },
    "minimax": {
        aliases: ["minimax-m2.1", "minimax-m2p1"],
        modelId: "accounts/fireworks/models/minimax-m2p1",
        provider: "fireworks",
        cost: [
            {
                date: new Date("2026-01-05").getTime(),
                promptTextTokens: perMillion(0.3),
                promptCachedTokens: perMillion(0.15),
                completionTextTokens: perMillion(1.2),
            },
        ],
        description: "MiniMax M2.1 - Multi-Language & Agent Workflows",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextWindow: 200000,
        isSpecialized: false,
    },
    "nomnom": {
        aliases: ["gemini-scrape", "web-research"],
        modelId: "nomnom",
        provider: "community",
        cost: [
            {
                date: new Date("2026-01-17").getTime(),
                promptTextTokens: perMillion(0.0), // Free - uses Pollinations under the hood
                completionTextTokens: perMillion(0.0),
            },
        ],
        description:
            "NomNom by @Itachi-1824 - Web Research with Search, Scrape & Crawl (Alpha)",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        search: true,
        isSpecialized: false,
    },
} as const satisfies Record<string, ServiceDefinition<string>>;
