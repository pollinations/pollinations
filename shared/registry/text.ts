import { COST_START_DATE, perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

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
export type TextModelName = keyof typeof TEXT_SERVICES;
export type TextModelId = (typeof TEXT_SERVICES)[TextModelName]["modelId"];

export const TEXT_SERVICES = {
    "openai": {
        aliases: ["gpt-5.4-nano", "gpt-5-mini"],
        modelId: "gpt-5.4-nano",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.2),
                promptCachedTokens: perMillion(0.02),
                completionTextTokens: perMillion(1.25),
            },
        ],
        description: "OpenAI GPT-5.4 Nano - Fast & Balanced",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        contextLength: 400000,
        isSpecialized: false,
    },
    "openai-fast": {
        aliases: ["gpt-5-nano", "gpt-5-nano-2025-08-07"],
        modelId: "gpt-5-nano-2025-08-07",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.05),
                promptCachedTokens: perMillion(0.005),
                completionTextTokens: perMillion(0.4),
            },
        ],
        description: "OpenAI GPT-5 Nano - Ultra Fast & Affordable",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        contextLength: 400000,
        isSpecialized: false,
    },
    "openai-large": {
        aliases: [
            "gpt-5.4",
            "gpt-5.4-reasoning",
            "gpt-5.2",
            "openai-reasoning",
            "gpt-5.2-reasoning",
        ],
        modelId: "gpt-5.4",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.5),
                promptCachedTokens: perMillion(0.25),
                completionTextTokens: perMillion(15.0),
            },
        ],
        description: "OpenAI GPT-5.4 - Most Powerful & Intelligent",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextLength: 400000,
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
        contextLength: 262144,
        isSpecialized: false,
    },
    "mistral": {
        aliases: [
            "mistral-small",
            "mistral-small-3.2",
            "mistral-small-3.2-24b-instruct-2506",
        ],
        modelId: "Mistral-Small-3.2-24B-Instruct-2506",
        provider: "ovhcloud",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.1),
                completionTextTokens: perMillion(0.3),
            },
        ],
        description: "Mistral Small 3.2 - Efficient & Cost-Effective",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        contextLength: 131072,
        isSpecialized: false,
    },
    "openai-audio": {
        aliases: [
            "gpt-audio-mini",
            "gpt-audio-mini-2025-12-15",
            "gpt-4o-mini-audio-preview",
            "gpt-4o-mini-audio-preview-2024-12-17",
        ],
        modelId: "gpt-audio-mini-2025-12-15",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.6),
                completionTextTokens: perMillion(2.4),
                promptAudioTokens: perMillion(10.0),
                completionAudioTokens: perMillion(20.0),
            },
        ],
        description: "OpenAI GPT Audio Mini - Voice Input & Output",
        voices: [...AUDIO_VOICES],
        inputModalities: ["text", "image", "audio"],
        outputModalities: ["audio", "text"],
        tools: true,
        contextLength: 128000,
        isSpecialized: false,
    },
    "openai-audio-large": {
        aliases: ["gpt-audio", "gpt-audio-1.5", "gpt-audio-2025-12-15"],
        modelId: "gpt-audio-1.5",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.5),
                completionTextTokens: perMillion(10.0),
                promptAudioTokens: perMillion(40.0),
                completionAudioTokens: perMillion(80.0),
            },
        ],
        description: "OpenAI GPT Audio 1.5 - Premium Voice Input & Output",
        voices: [...AUDIO_VOICES],
        inputModalities: ["text", "image", "audio"],
        outputModalities: ["audio", "text"],
        tools: true,
        contextLength: 128000,
        isSpecialized: false,
    },
    "gemini": {
        aliases: ["gemini-3-flash", "gemini-3-flash-preview"],
        modelId: "gemini-3-flash-preview",
        provider: "google",
        paidOnly: true,
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
        contextLength: 1048576,
        isSpecialized: false,
    },
    "gemini-flash-lite-3.1": {
        aliases: [
            "gemini-3.1-flash-lite",
            "gemini-3.1-flash-lite-preview",
            "gemini-flash-lite",
        ],
        modelId: "gemini-3.1-flash-lite-preview",
        provider: "google",
        paidOnly: true,
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.25),
                promptCachedTokens: perMillion(0.025),
                promptAudioTokens: perMillion(0.5),
                completionTextTokens: perMillion(1.5),
            },
        ],
        description: "Google Gemini 3.1 Flash Lite - Fast & Cost-Effective",
        inputModalities: ["text", "image", "audio"],
        outputModalities: ["text"],
        tools: true,
        search: true,
        codeExecution: true,
        contextLength: 1048576,
        isSpecialized: false,
    },
    "gemini-fast": {
        aliases: ["gemini-2.5-flash-lite"],
        modelId: "gemini-2.5-flash-lite",
        provider: "google",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.1), // per 1M tokens
                promptCachedTokens: perMillion(0.01), // per 1M tokens
                promptAudioTokens: perMillion(0.3), // per 1M tokens
                completionTextTokens: perMillion(0.4), // per 1M tokens
            },
        ],
        price: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.3), // per 1M tokens
                promptCachedTokens: perMillion(0.03), // per 1M tokens
                promptAudioTokens: perMillion(0.3), // per 1M tokens
                completionTextTokens: perMillion(1.2), // per 1M tokens
            },
        ],
        description:
            "Google Gemini 2.5 Flash Lite - Ultra Fast & Cost-Effective",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        search: true,
        codeExecution: true,
        contextLength: 1048576,
        isSpecialized: false,
    },
    "deepseek": {
        aliases: ["deepseek-v3", "deepseek-v3.2", "deepseek-reasoning"],
        modelId: "accounts/fireworks/models/deepseek-v3p2",
        provider: "fireworks",
        cost: [
            {
                date: new Date("2026-04-12").getTime(),
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
        contextLength: 163840,
        isSpecialized: false,
    },
    "grok": {
        aliases: [
            "grok-fast",
            "grok-4-1-fast",
            "grok-legacy",
            "grok-4",
            "grok-4-fast",
        ],
        modelId: "grok-4-1-fast-non-reasoning",
        provider: "azure",
        cost: [
            {
                date: new Date("2026-03-22").getTime(),
                promptTextTokens: perMillion(0.2),
                promptCachedTokens: perMillion(0.05),
                completionTextTokens: perMillion(0.5),
            },
        ],
        description: "xAI Grok 4.1 Fast - High Speed & Real-Time",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        contextLength: 2000000,
        isSpecialized: false,
    },
    "grok-large": {
        aliases: [
            "grok-4-20",
            "grok-4-20-reasoning",
            "grok-reasoning",
            "grok-4-1-fast-reasoning",
        ],
        modelId: "grok-4-20-reasoning",
        provider: "azure",
        cost: [
            {
                date: new Date("2026-04-08").getTime(),
                promptTextTokens: perMillion(2.0),
                promptCachedTokens: perMillion(0.2),
                completionTextTokens: perMillion(6.0),
            },
        ],
        description: "xAI Grok 4.20 Reasoning - Most Powerful Grok",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextLength: 2000000,
        isSpecialized: false,
    },
    "gemini-search": {
        aliases: ["gemini-2.5-flash-search", "gemini-2.5-flash-lite-search"],
        modelId: "gemini-2.5-flash-lite",
        provider: "google",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.2), // per 1M tokens
                promptCachedTokens: perMillion(0.02), // per 1M tokens
                promptAudioTokens: perMillion(0.2), // per 1M tokens (audio billed at same rate as text)
                completionTextTokens: perMillion(0.8), // per 1M tokens
            },
        ],
        price: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.3), // per 1M tokens, matches gemini-fast
                promptCachedTokens: perMillion(0.03), // per 1M tokens, matches gemini-fast
                promptAudioTokens: perMillion(0.3), // per 1M tokens, matches gemini-fast
                completionTextTokens: perMillion(1.2), // per 1M tokens, matches gemini-fast
            },
        ],
        description:
            "Google Gemini 2.5 Flash Lite Search - Web-grounded answers via Google Search",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: false,
        search: true,
        codeExecution: true,
        contextLength: 1048576,
        isSpecialized: false,
    },
    "midijourney": {
        aliases: [],
        modelId: "claude-haiku-4-5-20251001",
        provider: "bedrock",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.1),
                promptCachedTokens: perMillion(0.11),
                completionTextTokens: perMillion(5.5),
            },
        ],
        description: "MIDIjourney - AI Music Composition Assistant",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: true,
    },
    "midijourney-large": {
        aliases: [],
        modelId: "claude-opus-4-6",
        provider: "bedrock",
        paidOnly: true,
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(5.5),
                promptCachedTokens: perMillion(0.55),
                completionTextTokens: perMillion(27.5),
            },
        ],
        description: "MIDIjourney Large - Premium AI Music Composition",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: true,
    },
    "claude-fast": {
        aliases: ["claude-haiku-4.5", "claude-haiku"],
        modelId: "claude-haiku-4-5-20251001",
        provider: "bedrock",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.1),
                promptCachedTokens: perMillion(0.11),
                completionTextTokens: perMillion(5.5),
            },
        ],
        description: "Anthropic Claude Haiku 4.5 - Fast & Intelligent",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        contextLength: 200000,
        isSpecialized: false,
    },
    "claude": {
        aliases: ["claude-sonnet-4.6", "claude-sonnet"],
        modelId: "claude-sonnet-4-6",
        provider: "bedrock",
        paidOnly: true,
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(3.3),
                promptCachedTokens: perMillion(0.33),
                completionTextTokens: perMillion(16.5),
            },
        ],
        description: "Anthropic Claude Sonnet 4.6 - Most Capable & Balanced",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        contextLength: 200000,
        isSpecialized: false,
    },
    "claude-large": {
        aliases: ["claude-opus-4.6", "claude-opus"],
        modelId: "claude-opus-4-6",
        provider: "bedrock",
        paidOnly: true,
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(5.5),
                promptCachedTokens: perMillion(0.55),
                completionTextTokens: perMillion(27.5),
            },
        ],
        description: "Anthropic Claude Opus 4.6 - Most Intelligent Model",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        contextLength: 200000,
        isSpecialized: false,
    },
    "claude-legacy": {
        aliases: ["claude-opus-4.5", "claude-large-legacy"],
        modelId: "claude-opus-4-5-20251101",
        provider: "bedrock",
        paidOnly: true,
        hidden: true,
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(5.5),
                promptCachedTokens: perMillion(0.55),
                completionTextTokens: perMillion(27.5),
            },
        ],
        description: "Anthropic Claude Opus 4.5 - Legacy",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        contextLength: 200000,
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
        contextLength: 127072,
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
        contextLength: 128000,
        isSpecialized: false,
    },
    "kimi": {
        aliases: [
            "kimi-k2.5",
            "kimi-k2p5",
            "kimi-reasoning",
            "kimi-large",
            "kimi-k2-thinking",
            "kimi-thinking",
        ],
        modelId: "accounts/fireworks/models/kimi-k2p5",
        provider: "fireworks",
        cost: [
            {
                date: new Date("2026-04-12").getTime(),
                promptTextTokens: perMillion(0.6),
                promptCachedTokens: perMillion(0.1),
                completionTextTokens: perMillion(3.0),
            },
        ],
        description:
            "Moonshot Kimi K2.5 - Flagship Agentic Model with CoT Reasoning",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextLength: 262000,
        isSpecialized: false,
    },
    "gemini-large": {
        aliases: ["gemini-3.1-pro"],
        modelId: "gemini-3.1-pro-preview",
        provider: "google",
        paidOnly: true,
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.0),
                promptCachedTokens: perMillion(0.2),
                completionTextTokens: perMillion(12.0),
            },
        ],
        description:
            "Google Gemini 3.1 Pro - Most Intelligent Model with 1M Context (Preview)",
        inputModalities: ["text", "image", "audio", "video"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        search: true,
        codeExecution: false, // Disabled - was breaking gemini-large
        contextLength: 1048576,
        isSpecialized: false,
    },
    "gemini-legacy": {
        aliases: ["gemini-2.5-pro"],
        modelId: "gemini-2.5-pro",
        provider: "google",
        paidOnly: true,
        hidden: true,
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.25),
                promptCachedTokens: perMillion(0.31), // Google rate: $0.125 — marked up for margin
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
        contextLength: 1048576,
        isSpecialized: false,
    },
    "nova-fast": {
        aliases: ["amazon-nova-micro", "nova-micro"],
        modelId: "amazon.nova-micro-v1:0",
        provider: "bedrock",
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
        contextLength: 128000,
        isSpecialized: false,
    },
    "nova": {
        aliases: ["nova-2-lite", "amazon-nova-2-lite", "nova-2"],
        modelId: "us.amazon.nova-2-lite-v1:0",
        provider: "bedrock",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.33),
                completionTextTokens: perMillion(2.75),
            },
        ],
        description: "Amazon Nova 2 Lite - 1M Context with Reasoning",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextLength: 1048576,
        isSpecialized: false,
    },
    "glm": {
        aliases: ["glm-5", "glm-5.1", "glm-5p1", "glm-4.7", "glm-4p7"],
        modelId: "accounts/fireworks/models/glm-5p1",
        provider: "fireworks",
        cost: [
            {
                date: new Date("2026-04-12").getTime(),
                promptTextTokens: perMillion(1.0),
                promptCachedTokens: perMillion(0.2),
                completionTextTokens: perMillion(3.2),
            },
        ],
        description:
            "Z.ai GLM-5.1 - 744B MoE, Long Context Reasoning & Agentic Workflows",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextLength: 198000,
        isSpecialized: false,
    },
    "minimax": {
        aliases: [
            "minimax-m2.7",
            "minimax-m2p7",
            "minimax-m2.5",
            "minimax-m2p5",
        ],
        modelId: "accounts/fireworks/models/minimax-m2p7",
        provider: "fireworks",
        cost: [
            {
                date: new Date("2026-04-19").getTime(),
                promptTextTokens: perMillion(0.3),
                promptCachedTokens: perMillion(0.06),
                completionTextTokens: perMillion(1.2),
            },
        ],
        description: "MiniMax M2.7 - Coding, Agentic & Multi-Language",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextLength: 200000,
        isSpecialized: false,
    },
    "mistral-large": {
        aliases: ["mistral-large-3"],
        modelId: "Mistral-Large-3",
        provider: "azure",
        cost: [
            {
                date: new Date("2026-04-08").getTime(),
                promptTextTokens: perMillion(0.5),
                promptCachedTokens: perMillion(0.05),
                completionTextTokens: perMillion(1.5),
            },
        ],
        description: "Mistral Large 3 - Premium Multilingual & Reasoning",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextLength: 256000,
        isSpecialized: false,
    },
    "polly": {
        aliases: ["pollinations-ai", "polly-ai"],
        modelId: "polly",
        provider: "community",
        cost: [
            {
                date: new Date("2026-02-23").getTime(),
            },
        ],
        description:
            "Polly by @Itachi-1824 - Pollinations AI Assistant with GitHub, Code Search & Web Tools (Alpha)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        codeExecution: true,
        search: true,
        isSpecialized: false,
        alpha: true,
    },
    "qwen-coder-large": {
        aliases: ["qwen3-coder-next"],
        modelId: "qwen3-coder-next",
        provider: "alibaba",
        cost: [
            {
                date: new Date("2026-03-22").getTime(),
                promptTextTokens: perMillion(0.3), // per 1M tokens
                completionTextTokens: perMillion(1.5), // per 1M tokens
            },
        ],
        price: [
            {
                date: new Date("2026-03-22").getTime(),
                promptTextTokens: perMillion(0.45), // per 1M tokens
                completionTextTokens: perMillion(2.25), // per 1M tokens
            },
        ],
        description:
            "Qwen3 Coder Next - Advanced Code Generation via DashScope",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        contextLength: 262144,
        isSpecialized: false,
    },
    "qwen-large": {
        aliases: ["qwen3.6", "qwen3.6-plus", "qwen3p6-plus"],
        modelId: "accounts/fireworks/models/qwen3p6-plus",
        provider: "fireworks",
        cost: [
            {
                date: new Date("2026-04-12").getTime(),
                promptTextTokens: perMillion(0.5),
                promptCachedTokens: perMillion(0.1),
                completionTextTokens: perMillion(3.0),
            },
        ],
        description:
            "Qwen3.6 Plus - 396B MoE Flagship with Reasoning (Fireworks)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextLength: 1048576,
        isSpecialized: false,
    },
    "qwen-vision": {
        aliases: [
            "qwen3-vl",
            "qwen3-vl-30b-a3b-thinking",
            "qwen3-vl-thinking",
            "qwen3-vl-plus",
            "qwen-vl",
        ],
        modelId: "accounts/fireworks/models/qwen3-vl-30b-a3b-thinking",
        provider: "fireworks",
        cost: [
            {
                date: new Date("2026-04-19").getTime(),
                promptTextTokens: perMillion(0.15),
                promptCachedTokens: perMillion(0.08),
                completionTextTokens: perMillion(0.6),
            },
        ],
        description:
            "Qwen3 VL 30B A3B Thinking - Vision-Language Reasoning (Fireworks)",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: true,
        reasoning: true,
        contextLength: 262144,
        isSpecialized: false,
    },
    "qwen-safety": {
        aliases: ["qwen3guard-gen-8b"],
        modelId: "Qwen3Guard-Gen-8B",
        provider: "ovhcloud",
        cost: [
            {
                date: new Date("2026-02-15").getTime(),
                promptTextTokens: perMillion(0.01),
                completionTextTokens: perMillion(0.01),
            },
        ],
        description: "Qwen3Guard 8B - Content Safety & Moderation (OVH)",
        inputModalities: ["text"],
        outputModalities: ["text"],
        isSpecialized: true,
    },
} as const satisfies Record<string, ModelDefinition<string>>;
