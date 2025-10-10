import type {
    ModelRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "./registry";
import { ZERO_PRICE, PRICING_START_DATE, fromDPMT } from "./price-helpers";

export const TEXT_COSTS = {
    "gpt-5-nano-2025-08-07": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.055),
            promptCachedTokens: fromDPMT(0.0055),
            completionTextTokens: fromDPMT(0.44),
        },
    ],
    "gpt-5-mini-2025-08-07": [
        {
            date: new Date("2025-08-01 00:00:00").getTime(),
            promptTextTokens: fromDPMT(0.22),
            promptCachedTokens: fromDPMT(0.03),
            completionTextTokens: fromDPMT(1.73),
        },
    ],
    "gpt-5-chat-latest": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(2.5),
            promptCachedTokens: fromDPMT(0.625),
            completionTextTokens: fromDPMT(10.0),
        },
    ],
    "gpt-4.1-nano-2025-04-14": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.055),
            promptCachedTokens: fromDPMT(0.0055),
            completionTextTokens: fromDPMT(0.44),
        },
    ],
    "gpt-4.1-2025-04-14": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(1.91),
            promptCachedTokens: fromDPMT(0.48),
            completionTextTokens: fromDPMT(7.64),
        },
    ],
    "gpt-4o-mini-audio-preview-2024-12-17": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(2.50),
            promptCachedTokens: fromDPMT(0.625),
            completionTextTokens: fromDPMT(10.0),
            promptAudioTokens: fromDPMT(40.0),
            completionAudioTokens: fromDPMT(80.0),
        },
    ],
    "qwen2.5-coder-32b-instruct": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.4),
            promptCachedTokens: fromDPMT(0.1),
            completionTextTokens: fromDPMT(1.6),
        },
    ],
    "mistral-small-3.1-24b-instruct-2503": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.2),
            promptCachedTokens: fromDPMT(0.05),
            completionTextTokens: fromDPMT(0.8),
        },
    ],
    "mistral.mistral-small-2402-v1:0": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.2),
            promptCachedTokens: fromDPMT(0.05),
            completionTextTokens: fromDPMT(0.8),
        },
    ],
    "us.deepseek.r1-v1:0": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(1.35),
            promptCachedTokens: fromDPMT(0.3375),
            completionTextTokens: fromDPMT(5.4),
        },
    ],
    "amazon.nova-micro-v1:0": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.035),
            promptCachedTokens: fromDPMT(0.009),
            completionTextTokens: fromDPMT(0.14),
        },
    ],
    "us.meta.llama3-1-8b-instruct-v1:0": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.15),
            promptCachedTokens: fromDPMT(0.0375),
            completionTextTokens: fromDPMT(0.6),
        },
    ],
    "us.anthropic.claude-3-5-haiku-20241022-v1:0": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.8),
            promptCachedTokens: fromDPMT(0.2),
            completionTextTokens: fromDPMT(4.0),
        },
    ],
    "openai/o4-mini": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.60),
            promptCachedTokens: fromDPMT(0.25), // 58% discount for cached tokens
            completionTextTokens: fromDPMT(2.40),
        },
    ],
    "gemini-2.5-flash-lite": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.10),
            promptCachedTokens: fromDPMT(0.025), // Estimated 75% discount for caching
            completionTextTokens: fromDPMT(0.40),
        },
    ],
    "deepseek-ai/deepseek-v3.1-maas": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.6),
            promptCachedTokens: fromDPMT(0.15),
            completionTextTokens: fromDPMT(1.7),
        },
    ],
} as const satisfies ModelRegistry;

export const TEXT_SERVICES = {
    "openai": {
        aliases: ["gpt-5-mini"],
        modelId: "gpt-5-nano-2025-08-07",
        price: [ZERO_PRICE],
        provider: "azure-openai",
    },
    "openai-fast": {
        aliases: ["gpt-5-nano"],
        modelId: "gpt-4.1-nano-2025-04-14",
        price: [ZERO_PRICE],
        provider: "azure-openai",
    },
    "openai-large": {
        aliases: ["gpt-5-chat"],
        modelId: "gpt-5-chat-latest",
        price: TEXT_COSTS["gpt-5-chat-latest"],
        provider: "azure-openai",
    },
    "qwen-coder": {
        aliases: ["qwen2.5-coder-32b-instruct"],
        modelId: "qwen2.5-coder-32b-instruct",
        price: TEXT_COSTS["qwen2.5-coder-32b-instruct"],
        provider: "scaleway",
    },
    "mistral": {
        aliases: ["mistral-small-3.1-24b-instruct", "mistral-small-3.1-24b-instruct-2503"],
        modelId: "mistral-small-3.1-24b-instruct-2503",
        price: TEXT_COSTS["mistral-small-3.1-24b-instruct-2503"],
        provider: "scaleway",
    },
    "mistral-romance": {
        aliases: ["mistral-nemo-instruct-2407-romance", "mistral-roblox"],
        modelId: "mistral.mistral-small-2402-v1:0",
        price: TEXT_COSTS["mistral.mistral-small-2402-v1:0"],
        provider: "aws-bedrock",
    },
    "deepseek-reasoning": {
        aliases: ["deepseek-r1-0528", "us.deepseek.r1-v1:0"],
        modelId: "us.deepseek.r1-v1:0",
        price: TEXT_COSTS["us.deepseek.r1-v1:0"],
        provider: "aws-bedrock",
    },
    "openai-audio": {
        aliases: ["gpt-4o-mini-audio-preview"],
        modelId: "gpt-4o-mini-audio-preview-2024-12-17",
        price: TEXT_COSTS["gpt-4o-mini-audio-preview-2024-12-17"],
        provider: "azure-openai",
    },
    "nova-fast": {
        aliases: ["nova-micro-v1"],
        modelId: "amazon.nova-micro-v1:0",
        price: TEXT_COSTS["amazon.nova-micro-v1:0"],
        provider: "aws-bedrock",
    },
    "roblox-rp": {
        aliases: ["llama-roblox", "llama-fast-roblox"],
        modelId: "us.meta.llama3-1-8b-instruct-v1:0",
        price: TEXT_COSTS["us.meta.llama3-1-8b-instruct-v1:0"],
        provider: "aws-bedrock",
    },
    "claudyclaude": {
        aliases: ["claude-3-5-haiku"],
        modelId: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
        price: TEXT_COSTS["us.anthropic.claude-3-5-haiku-20241022-v1:0"],
        provider: "aws-bedrock",
    },
    "openai-reasoning": {
        aliases: ["o4-mini"],
        modelId: "openai/o4-mini",
        price: TEXT_COSTS["openai/o4-mini"],
        provider: "api-navy",
    },
    "gemini": {
        aliases: ["gemini-2.5-flash-lite"],
        modelId: "gemini-2.5-flash-lite",
        price: TEXT_COSTS["gemini-2.5-flash-lite"],
        provider: "vertex-ai",
    },
    "deepseek": {
        aliases: ["deepseek-v3", "deepseek-v3.1", "deepseek-ai/deepseek-v3.1-maas"],
        modelId: "deepseek-ai/deepseek-v3.1-maas",
        price: TEXT_COSTS["deepseek-ai/deepseek-v3.1-maas"],
        provider: "vertex-ai",
    },
    "gemini-search": {
        aliases: ["searchgpt", "geminisearch"],
        modelId: "gemini-2.5-flash-lite",
        price: TEXT_COSTS["gemini-2.5-flash-lite"],
        provider: "vertex-ai",
    },
    "chickytutor": {
        aliases: [],
        modelId: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
        price: TEXT_COSTS["us.anthropic.claude-3-5-haiku-20241022-v1:0"],
        provider: "aws-bedrock",
    },
    "unity": {
        aliases: [],
        modelId: "mistral-small-3.1-24b-instruct-2503",
        price: TEXT_COSTS["mistral-small-3.1-24b-instruct-2503"],
        provider: "scaleway",
    },
    "midijourney": {
        aliases: [],
        modelId: "gpt-4.1-2025-04-14",
        price: TEXT_COSTS["gpt-4.1-2025-04-14"],
        provider: "azure-openai",
    },
    "rtist": {
        aliases: [],
        modelId: "gpt-4.1-2025-04-14",
        price: TEXT_COSTS["gpt-4.1-2025-04-14"],
        provider: "azure-openai",
    },
    "evil": {
        aliases: [],
        modelId: "mistral-small-3.1-24b-instruct-2503",
        price: TEXT_COSTS["mistral-small-3.1-24b-instruct-2503"],
        provider: "scaleway",
    },
    "bidara": {
        aliases: [],
        modelId: "gpt-4.1-nano-2025-04-14",
        price: TEXT_COSTS["gpt-4.1-nano-2025-04-14"],
        provider: "azure-openai",
    },
} as const satisfies ServiceRegistry<typeof TEXT_COSTS>;
