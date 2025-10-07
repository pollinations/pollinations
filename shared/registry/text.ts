import type {
    ModelProviderRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "./registry.ts";
import { ZERO_PRICE, PRICING_START_DATE, fromDPMT } from "./price-helpers.ts";

export const TEXT_MODELS = {
    "gpt-5-nano-2025-08-07": {
        displayName: "OpenAI GPT-5 Nano (Azure)",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(0.055),
                promptCachedTokens: fromDPMT(0.0055),
                completionTextTokens: fromDPMT(0.44),
            },
        ],
    },
    "gpt-5-mini-2025-08-07": {
        displayName: "OpenAI GPT-5 Nano (Azure)",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(0.22),
                promptCachedTokens: fromDPMT(0.03),
                completionTextTokens: fromDPMT(1.73),
            },
        ],
    },
    "gpt-5-chat-latest": {
        displayName: "OpenAI GPT-5 Chat",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(2.5),
                promptCachedTokens: fromDPMT(0.625),
                completionTextTokens: fromDPMT(10.0),
            },
        ],
    },
    "gpt-4.1-nano-2025-04-14": {
        displayName: "OpenAI GPT-4.1 Nano (Azure)",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(0.055),
                promptCachedTokens: fromDPMT(0.0055),
                completionTextTokens: fromDPMT(0.44),
            },
        ],
    },
    "gpt-4.1-2025-04-14": {
        displayName: "OpenAI GPT-4.1 (Azure)",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(1.91),
                promptCachedTokens: fromDPMT(0.48),
                completionTextTokens: fromDPMT(7.64),
            },
        ],
    },
    "gpt-4o-mini-audio-preview-2024-12-17": {
        displayName: "OpenAI GPT-4o Mini Audio Preview (Azure)",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(0.1432),
                promptCachedTokens: fromDPMT(0.075),
                completionTextTokens: fromDPMT(0.572793),
                promptAudioTokens: fromDPMT(9.5466),
                completionAudioTokens: fromDPMT(19.093079),
            },
        ],
    },
    "qwen2.5-coder-32b-instruct": {
        displayName: "Qwen 2.5 Coder 32B (Scaleway)",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(0.4),
                promptCachedTokens: fromDPMT(0.1),
                completionTextTokens: fromDPMT(1.6),
            },
        ],
    },
    "mistral-small-3.1-24b-instruct-2503": {
        displayName: "Mistral Small 3.1 24B (Scaleway)",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(0.2),
                promptCachedTokens: fromDPMT(0.05),
                completionTextTokens: fromDPMT(0.8),
            },
        ],
    },
    "mistral.mistral-small-2402-v1:0": {
        displayName: "Mistral Small",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(0.2),
                promptCachedTokens: fromDPMT(0.05),
                completionTextTokens: fromDPMT(0.8),
            },
        ],
    },
    "us.deepseek.r1-v1:0": {
        displayName: "DeepSeek R1",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(1.35),
                promptCachedTokens: fromDPMT(0.3375),
                completionTextTokens: fromDPMT(5.4),
            },
        ],
    },
    "amazon.nova-micro-v1:0": {
        displayName: "Amazon Nova Micro (Bedrock)",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(0.035),
                promptCachedTokens: fromDPMT(0.009),
                completionTextTokens: fromDPMT(0.14),
            },
        ],
    },
    "us.meta.llama3-1-8b-instruct-v1:0": {
        displayName: "Meta Llama 3.1 8B Instruct (Bedrock)",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(0.15),
                promptCachedTokens: fromDPMT(0.0375),
                completionTextTokens: fromDPMT(0.6),
            },
        ],
    },
    "us.anthropic.claude-3-5-haiku-20241022-v1:0": {
        displayName: "Claude 3.5 Haiku (Bedrock)",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(0.8),
                promptCachedTokens: fromDPMT(0.2),
                completionTextTokens: fromDPMT(4.0),
            },
        ],
    },
    "openai/o4-mini": {
        displayName: "OpenAI o4 Mini (API Navy)",
        costType: "per_generation_cost",
        cost: [ZERO_PRICE],
    },
    "google/gemini-2.5-flash-lite": {
        displayName: "Google Gemini 2.5 Flash Lite (API Navy)",
        costType: "per_generation_cost",
        cost: [ZERO_PRICE],
    },
    "gemini-2.5-flash-lite-search": {
        displayName: "Google Gemini 2.5 Flash Lite Search",
        costType: "per_generation_cost",
        cost: [
            {
                date: PRICING_START_DATE,
                promptTextTokens: fromDPMT(0.5),
                promptCachedTokens: fromDPMT(0.125),
                completionTextTokens: fromDPMT(2.0),
            },
        ],
    },
} as const satisfies ModelProviderRegistry;

export const TEXT_SERVICES = {
    "openai": {
        displayName: "OpenAI GPT-5 Nano",
        aliases: ["gpt-5-nano"],
        modelProviders: ["gpt-5-nano-2025-08-07"],
        price: [ZERO_PRICE],
    },
    "openai-fast": {
        displayName: "OpenAI GPT-4.1 Nano",
        aliases: ["gpt-4.1-nano"],
        modelProviders: ["gpt-4.1-nano-2025-04-14"],
        price: [ZERO_PRICE],
    },
    "openai-large": {
        displayName: "OpenAI GPT-4.1",
        aliases: ["gpt-4.1"],
        modelProviders: ["gpt-4.1-2025-04-14"],
        price: TEXT_MODELS["gpt-4.1-2025-04-14"].cost,
    },
    "qwen-coder": {
        displayName: "Qwen 2.5 Coder 32B",
        aliases: ["qwen2.5-coder-32b-instruct"],
        modelProviders: ["qwen2.5-coder-32b-instruct"],
        price: TEXT_MODELS["qwen2.5-coder-32b-instruct"].cost,
    },
    "mistral": {
        displayName: "Mistral Small 3.1 24B",
        aliases: ["mistral-small-3.1-24b-instruct"],
        modelProviders: ["mistral-small-3.1-24b-instruct-2503"],
        price: TEXT_MODELS["mistral-small-3.1-24b-instruct-2503"].cost,
    },
    "mistral-romance": {
        displayName: "Mistral Small 2402 (Bedrock) - Romance Companion",
        aliases: ["mistral-nemo-instruct-2407-romance", "mistral-roblox"],
        modelProviders: ["mistral.mistral-small-2402-v1:0"],
        price: TEXT_MODELS["mistral.mistral-small-2402-v1:0"].cost,
    },
    "deepseek-reasoning": {
        displayName: "DeepSeek R1 0528 (Bedrock)",
        aliases: ["deepseek-r1-0528"],
        modelProviders: ["us.deepseek.r1-v1:0"],
        price: TEXT_MODELS["us.deepseek.r1-v1:0"].cost,
    },
    "openai-audio": {
        displayName: "OpenAI GPT-4o Mini Audio Preview",
        aliases: ["gpt-4o-mini-audio-preview"],
        modelProviders: ["gpt-4o-mini-audio-preview-2024-12-17"],
        price: TEXT_MODELS["gpt-4o-mini-audio-preview-2024-12-17"].cost,
    },
    "nova-fast": {
        displayName: "Amazon Nova Micro (Bedrock)",
        aliases: ["nova-micro-v1"],
        modelProviders: ["amazon.nova-micro-v1:0"],
        price: TEXT_MODELS["amazon.nova-micro-v1:0"].cost,
    },
    "roblox-rp": {
        displayName: "Llama 3.1 8B Instruct (Cross-Region Bedrock)",
        aliases: ["llama-roblox", "llama-fast-roblox"],
        modelProviders: ["us.meta.llama3-1-8b-instruct-v1:0"],
        price: TEXT_MODELS["us.meta.llama3-1-8b-instruct-v1:0"].cost,
    },
    "claudyclaude": {
        displayName: "Claude 3.5 Haiku (Bedrock)",
        aliases: ["claude-3-5-haiku"],
        modelProviders: ["us.anthropic.claude-3-5-haiku-20241022-v1:0"],
        price: TEXT_MODELS["us.anthropic.claude-3-5-haiku-20241022-v1:0"].cost,
    },
    "openai-reasoning": {
        displayName: "OpenAI o4-mini (api.navy)",
        aliases: ["o4-mini"],
        modelProviders: ["openai/o4-mini"],
        price: TEXT_MODELS["openai/o4-mini"].cost,
    },
    "gemini": {
        displayName: "Gemini 2.5 Flash Lite (api.navy)",
        aliases: ["gemini-2.5-flash-lite"],
        modelProviders: ["google/gemini-2.5-flash-lite"],
        price: TEXT_MODELS["google/gemini-2.5-flash-lite"].cost,
    },
    "unity": {
        displayName: "Unity Unrestricted Agent",
        aliases: [],
        modelProviders: ["mistral-small-3.1-24b-instruct-2503"],
        price: TEXT_MODELS["mistral-small-3.1-24b-instruct-2503"].cost,
    },
    "mixera": {
        displayName: "Mixera AI Companion",
        aliases: [],
        modelProviders: ["gpt-4.1-2025-04-14"],
        price: TEXT_MODELS["gpt-4.1-2025-04-14"].cost,
    },
    "midijourney": {
        displayName: "MIDIjourney",
        aliases: [],
        modelProviders: ["gpt-4.1-2025-04-14"],
        price: TEXT_MODELS["gpt-4.1-2025-04-14"].cost,
    },
    "rtist": {
        displayName: "Rtist",
        aliases: [],
        modelProviders: ["gpt-4.1-2025-04-14"],
        price: TEXT_MODELS["gpt-4.1-2025-04-14"].cost,
    },
    "evil": {
        displayName: "Evil",
        aliases: [],
        modelProviders: ["mistral-small-3.1-24b-instruct-2503"],
        price: TEXT_MODELS["mistral-small-3.1-24b-instruct-2503"].cost,
    },
    "bidara": {
        displayName:
            "BIDARA (Biomimetic Designer and Research Assistant by NASA)",
        aliases: [],
        modelProviders: ["gpt-4.1-nano-2025-04-14"],
        price: TEXT_MODELS["gpt-4.1-2025-04-14"].cost,
    },
} as const satisfies ServiceRegistry<typeof TEXT_MODELS>;

