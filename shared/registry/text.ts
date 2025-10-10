import type {
    ModelRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "./registry.ts";
import { ZERO_PRICE, PRICING_START_DATE, fromDPMT } from "./price-helpers.ts";

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
    "openai/o4-mini": [ZERO_PRICE],
    "google/gemini-2.5-flash-lite": [ZERO_PRICE],
    "gemini-2.5-flash-lite-search": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.5),
            promptCachedTokens: fromDPMT(0.125),
            completionTextTokens: fromDPMT(2.0),
        },
    ],
} as const satisfies ModelRegistry;

export const TEXT_SERVICES = {
    "openai": {
        aliases: ["gpt-5-nano"],
        modelIds: ["gpt-5-nano-2025-08-07"],
        price: [ZERO_PRICE],
    },
    "openai-fast": {
        aliases: ["gpt-4.1-nano"],
        modelIds: ["gpt-4.1-nano-2025-04-14"],
        price: [ZERO_PRICE],
    },
    "openai-large": {
        aliases: ["gpt-4.1"],
        modelIds: ["gpt-4.1-2025-04-14"],
        price: TEXT_COSTS["gpt-4.1-2025-04-14"],
    },
    "qwen-coder": {
        aliases: ["qwen2.5-coder-32b-instruct"],
        modelIds: ["qwen2.5-coder-32b-instruct"],
        price: TEXT_COSTS["qwen2.5-coder-32b-instruct"],
    },
    "mistral": {
        aliases: ["mistral-small-3.1-24b-instruct"],
        modelIds: ["mistral-small-3.1-24b-instruct-2503"],
        price: TEXT_COSTS["mistral-small-3.1-24b-instruct-2503"],
    },
    "mistral-romance": {
        aliases: ["mistral-nemo-instruct-2407-romance", "mistral-roblox"],
        modelIds: ["mistral.mistral-small-2402-v1:0"],
        price: TEXT_COSTS["mistral.mistral-small-2402-v1:0"],
    },
    "deepseek-reasoning": {
        aliases: ["deepseek-r1-0528"],
        modelIds: ["us.deepseek.r1-v1:0"],
        price: TEXT_COSTS["us.deepseek.r1-v1:0"],
    },
    "openai-audio": {
        aliases: ["gpt-4o-mini-audio-preview"],
        modelIds: ["gpt-4o-mini-audio-preview-2024-12-17"],
        price: TEXT_COSTS["gpt-4o-mini-audio-preview-2024-12-17"],
    },
    "nova-fast": {
        aliases: ["nova-micro-v1"],
        modelIds: ["amazon.nova-micro-v1:0"],
        price: TEXT_COSTS["amazon.nova-micro-v1:0"],
    },
    "roblox-rp": {
        aliases: ["llama-roblox", "llama-fast-roblox"],
        modelIds: ["us.meta.llama3-1-8b-instruct-v1:0"],
        price: TEXT_COSTS["us.meta.llama3-1-8b-instruct-v1:0"],
    },
    "claudyclaude": {
        aliases: ["claude-3-5-haiku"],
        modelIds: ["us.anthropic.claude-3-5-haiku-20241022-v1:0"],
        price: TEXT_COSTS["us.anthropic.claude-3-5-haiku-20241022-v1:0"],
    },
    "openai-reasoning": {
        aliases: ["o4-mini"],
        modelIds: ["openai/o4-mini"],
        price: TEXT_COSTS["openai/o4-mini"],
    },
    "gemini": {
        aliases: ["gemini-2.5-flash-lite"],
        modelIds: ["google/gemini-2.5-flash-lite"],
        price: TEXT_COSTS["google/gemini-2.5-flash-lite"],
    },
    "unity": {
        aliases: [],
        modelIds: ["mistral-small-3.1-24b-instruct-2503"],
        price: TEXT_COSTS["mistral-small-3.1-24b-instruct-2503"],
    },
    "mixera": {
        aliases: [],
        modelIds: ["gpt-4.1-2025-04-14"],
        price: TEXT_COSTS["gpt-4.1-2025-04-14"],
    },
    "midijourney": {
        aliases: [],
        modelIds: ["gpt-4.1-2025-04-14"],
        price: TEXT_COSTS["gpt-4.1-2025-04-14"],
    },
    "rtist": {
        aliases: [],
        modelIds: ["gpt-4.1-2025-04-14"],
        price: TEXT_COSTS["gpt-4.1-2025-04-14"],
    },
    "evil": {
        aliases: [],
        modelIds: ["mistral-small-3.1-24b-instruct-2503"],
        price: TEXT_COSTS["mistral-small-3.1-24b-instruct-2503"],
    },
    "bidara": {
        aliases: [],
        modelIds: ["gpt-4.1-nano-2025-04-14"],
        price: TEXT_COSTS["gpt-4.1-2025-04-14"],
    },
} as const satisfies ServiceRegistry<typeof TEXT_COSTS>;

