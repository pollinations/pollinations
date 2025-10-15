import type {
    ModelRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "./registry";
import type { UserTier } from "./types";
import { ZERO_PRICE, PRICING_START_DATE, fromDPMT } from "./price-helpers";
export const TEXT_COSTS = {
    "gpt-5-nano-2025-08-07": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.060),
            promptCachedTokens: fromDPMT(0.010),
            completionTextTokens: fromDPMT(0.44),
        },
    ],
    "gpt-5-chat-latest": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(1.25),
            promptCachedTokens: fromDPMT(0.130),
            completionTextTokens: fromDPMT(10.0),
        },
    ],
    "gpt-4.1-nano-2025-04-14": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.11),
            promptCachedTokens: fromDPMT(0.03),
            completionTextTokens: fromDPMT(0.44),
        },
    ],
    "gpt-4.1-2025-04-14": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(2.20),
            promptCachedTokens: fromDPMT(0.55),
            completionTextTokens: fromDPMT(8.80),
        },
    ],
    "gpt-4o-mini-audio-preview-2024-12-17": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.165),
            completionTextTokens: fromDPMT(0.66),
            promptAudioTokens: fromDPMT(11.0),
            completionAudioTokens: fromDPMT(22.0),
        },
    ],
    "qwen2.5-coder-32b-instruct": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.9),
            completionTextTokens: fromDPMT(0.9),
        },
    ],
    "mistral-small-3.1-24b-instruct-2503": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.15),
            completionTextTokens: fromDPMT(0.35),
        },
    ],
    "mistral-small-3.2-24b-instruct-2506": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.15),
            completionTextTokens: fromDPMT(0.35),
        },
    ],
    "mistral-nemo-instruct-2407": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.2),
            completionTextTokens: fromDPMT(0.2),
        },
    ],
    "us.meta.llama3-1-8b-instruct-v1:0": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.22),
            completionTextTokens: fromDPMT(0.22),
        },
    ],
    "us.anthropic.claude-3-5-haiku-20241022-v1:0": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.8),
            completionTextTokens: fromDPMT(4.0),
        },
    ],
    "openai/o4-mini": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(1.21),
            promptCachedTokens: fromDPMT(0.31),
            completionTextTokens: fromDPMT(4.84),
        },
    ],
    "gemini-2.5-flash-lite": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(0.10),
            promptCachedTokens: fromDPMT(0.010),
            completionTextTokens: fromDPMT(0.40),
        },
    ],
    "myceli-deepseek-v3.1": [
        {
            date: PRICING_START_DATE,
            promptTextTokens: fromDPMT(1.25),
            completionTextTokens: fromDPMT(5.0),
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
        tier: "seed",
    },
    "qwen-coder": {
        aliases: ["qwen2.5-coder-32b-instruct"],
        modelId: "qwen2.5-coder-32b-instruct",
        price: TEXT_COSTS["qwen2.5-coder-32b-instruct"],
        provider: "scaleway",
    },
    "mistral": {
        aliases: ["mistral-small-3.1-24b-instruct", "mistral-small-3.1-24b-instruct-2503", "mistral-small-3.2-24b-instruct-2506"],
        modelId: "mistral-small-3.2-24b-instruct-2506",
        price: TEXT_COSTS["mistral-small-3.2-24b-instruct-2506"],
        provider: "scaleway",
    },
    // "mistral-naughty": {
    //     aliases: ["mistral-romance", "mistral-nemo-instruct-2407-romance", "mistral-roblox"],
    //     modelId: "mistral-nemo-instruct-2407",
    //     price: TEXT_COSTS["mistral-nemo-instruct-2407"],
    //     provider: "scaleway",
    //     tier: "flower",
    // },
    "openai-audio": {
        aliases: ["gpt-4o-mini-audio-preview"],
        modelId: "gpt-4o-mini-audio-preview-2024-12-17",
        price: TEXT_COSTS["gpt-4o-mini-audio-preview-2024-12-17"],
        provider: "azure-openai",
        tier: "seed",
    },
    "roblox-rp": {
        aliases: ["llama-roblox", "llama-fast-roblox"],
        modelId: "us.meta.llama3-1-8b-instruct-v1:0",
        price: TEXT_COSTS["us.meta.llama3-1-8b-instruct-v1:0"],
        provider: "aws-bedrock",
        tier: "seed",
    },
    "openai-reasoning": {
        aliases: ["o4-mini"],
        modelId: "openai/o4-mini",
        price: TEXT_COSTS["openai/o4-mini"],
        provider: "api-navy",
        tier: "seed",
    },
    "gemini": {
        aliases: ["gemini-2.5-flash-lite"],
        modelId: "gemini-2.5-flash-lite",
        price: TEXT_COSTS["gemini-2.5-flash-lite"],
        provider: "vertex-ai",
        tier: "seed",
    },
    "deepseek": {
        aliases: ["deepseek-v3", "deepseek-v3.1", "deepseek-reasoning", "deepseek-r1-0528"],
        modelId: "myceli-deepseek-v3.1",
        price: TEXT_COSTS["myceli-deepseek-v3.1"],
        provider: "azure",
        tier: "seed",
    },
    "gemini-search": {
        aliases: ["searchgpt", "geminisearch"],
        modelId: "gemini-2.5-flash-lite",
        price: TEXT_COSTS["gemini-2.5-flash-lite"],
        provider: "vertex-ai",
        tier: "seed",
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
        tier: "seed",
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
        tier: "seed",
    },
    "evil": {
        aliases: [],
        modelId: "mistral-small-3.1-24b-instruct-2503",
        price: TEXT_COSTS["mistral-small-3.1-24b-instruct-2503"],
        provider: "scaleway",
        tier: "seed",
    },
    "bidara": {
        aliases: [],
        modelId: "gpt-4.1-nano-2025-04-14",
        price: TEXT_COSTS["gpt-4.1-nano-2025-04-14"],
        provider: "azure-openai",
    },
} as const satisfies ServiceRegistry<typeof TEXT_COSTS>;
