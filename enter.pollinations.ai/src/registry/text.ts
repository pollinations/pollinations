import type {
    ModelProviderRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "@/registry/registry";
import { ZERO_PRICE_TEXT, fromDPMT } from "@/registry/zero-price";

export const TEXT_MODELS = {
    "gpt-5-nano-2025-08-07": {
        displayName: "OpenAI GPT-5 Nano (Azure)",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(0.055), // $0.055 per 1M tokens
                promptCachedTokens: fromDPMT(0.0055), // $0.0055 per 1M tokens
                completionTextTokens: fromDPMT(0.44), // $0.44 per 1M tokens
            },
        ],
    },
    "gpt-5-chat-latest": {
        displayName: "OpenAI GPT-5 Chat",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(2.5), // $2.5 per 1M tokens
                promptCachedTokens: fromDPMT(0.625), // $0.625 per 1M tokens
                completionTextTokens: fromDPMT(10.0), // $10 per 1M tokens
            },
        ],
    },
    "gpt-4.1-nano-2025-04-14": {
        displayName: "OpenAI GPT-4.1 Nano (Azure)",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(0.055), // $0.055 per 1M tokens
                promptCachedTokens: fromDPMT(0.0055), // $0.0055 per 1M tokens
                completionTextTokens: fromDPMT(0.44), // $0.44 per 1M tokens
            },
        ],
    },
    "gpt-4.1-2025-04-14": {
        displayName: "OpenAI GPT-4.1 (Azure)",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(1.91), // $1.91 per 1M tokens
                promptCachedTokens: fromDPMT(0.48), // $0.48 per 1M tokens
                completionTextTokens: fromDPMT(7.64), // $7.64 per 1M tokens
            },
        ],
    },
    "gpt-4o-mini-audio-preview-2024-12-17": {
        displayName: "OpenAI GPT-4o Mini Audio Preview (Azure)",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(0.1432), // $0.1432 per 1M tokens
                promptCachedTokens: fromDPMT(0.075), // $0.075 per 1M tokens
                completionTextTokens: fromDPMT(0.572793), // $0.572793 per 1M tokens
                promptAudioTokens: fromDPMT(9.5466), // $9.5466 per 1M tokens
                completionAudioTokens: fromDPMT(19.093079), // $19.093079 per 1M tokens
            },
        ],
    },
    "qwen2.5-coder-32b-instruct": {
        displayName: "Qwen 2.5 Coder 32B (Scaleway)",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(0.4), // $0.4 per 1M tokens
                promptCachedTokens: fromDPMT(0.1), // $0.1 per 1M tokens
                completionTextTokens: fromDPMT(1.6), // $1.6 per 1M tokens
            },
        ],
    },
    "mistral-small-3.1-24b-instruct-2503": {
        displayName: "Mistral Small 3.1 24B (Scaleway)",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(0.2), // $0.2 per 1M tokens
                promptCachedTokens: fromDPMT(0.05), // $0.05 per 1M tokens
                completionTextTokens: fromDPMT(0.8), // $0.8 per 1M tokens
            },
        ],
    },
    "mistral.mistral-small-2402-v1:0": {
        displayName: "Mistral Small",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(0.2), // $0.2 per 1M tokens
                promptCachedTokens: fromDPMT(0.05), // $0.05 per 1M tokens
                completionTextTokens: fromDPMT(0.8), // $0.8 per 1M tokens
            },
        ],
    },
    "us.deepseek.r1-v1:0": {
        displayName: "DeepSeek R1",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(1.35), // $1.35 per 1M tokens
                promptCachedTokens: fromDPMT(0.3375), // $0.3375 per 1M tokens
                completionTextTokens: fromDPMT(5.4), // $5.4 per 1M tokens
            },
        ],
    },
    "amazon.nova-micro-v1:0": {
        displayName: "Amazon Nova Micro (Bedrock)",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(0.035), // $0.035 per 1M tokens
                promptCachedTokens: fromDPMT(0.009), // $0.009 per 1M tokens
                completionTextTokens: fromDPMT(0.14), // $0.14 per 1M tokens
            },
        ],
    },
    "us.meta.llama3-1-8b-instruct-v1:0": {
        displayName: "Meta Llama 3.1 8B Instruct (Bedrock)",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(0.15), // $0.15 per 1M tokens
                promptCachedTokens: fromDPMT(0.0375), // $0.0375 per 1M tokens
                completionTextTokens: fromDPMT(0.6), // $0.6 per 1M tokens
            },
        ],
    },
    "us.anthropic.claude-3-5-haiku-20241022-v1:0": {
        displayName: "Claude 3.5 Haiku (Bedrock)",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(0.8), // $0.8 per 1M tokens
                promptCachedTokens: fromDPMT(0.2), // $0.2 per 1M tokens
                completionTextTokens: fromDPMT(4.0), // $4 per 1M tokens
            },
        ],
    },
    "openai/o4-mini": {
        displayName: "OpenAI o4 Mini (API Navy)",
        costType: "per_generation_cost",
        cost: [ZERO_PRICE_TEXT],
    },
    "google/gemini-2.5-flash-lite": {
        displayName: "Google Gemini 2.5 Flash Lite (API Navy)",
        costType: "per_generation_cost",
        cost: [ZERO_PRICE_TEXT],
    },
    "gemini-2.5-flash-lite-search": {
        displayName: "Google Gemini 2.5 Flash Lite Search",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: fromDPMT(0.5), // $0.5 per 1M tokens
                promptCachedTokens: fromDPMT(0.125), // $0.125 per 1M tokens
                completionTextTokens: fromDPMT(2.0), // $2 per 1M tokens
            },
        ],
    },
} as const satisfies ModelProviderRegistry;

export const TEXT_SERVICES = {
    "openai": {
        displayName: "OpenAI GPT-5 Nano",
        aliases: ["gpt-5-nano"],
        modelProviders: ["gpt-5-nano-2025-08-07"],
        price: [ZERO_COST_TEXT],
    },
    "openai-fast": {
        displayName: "OpenAI GPT-4.1 Nano",
        aliases: ["gpt-4.1-nano"],
        modelProviders: ["gpt-4.1-nano-2025-04-14"],
        price: [ZERO_COST_TEXT],
    },
    "openai-large": {
        displayName: "OpenAI GPT-4.1",
        aliases: ["gpt-4.1"],
        modelProviders: ["gpt-4.1-2025-04-14"],
        price: costAsPrice("gpt-4.1-2025-04-14"),
    },
    "qwen-coder": {
        displayName: "Qwen 2.5 Coder 32B",
        aliases: ["qwen2.5-coder-32b-instruct"],
        modelProviders: ["qwen2.5-coder-32b-instruct"],
        price: costAsPrice("qwen2.5-coder-32b-instruct"),
    },
    "mistral": {
        displayName: "Mistral Small 3.1 24B",
        aliases: ["mistral-small-3.1-24b-instruct"],
        modelProviders: ["mistral-small-3.1-24b-instruct-2503"],
        price: costAsPrice("mistral-small-3.1-24b-instruct-2503"),
    },
    "mistral-romance": {
        displayName: "Mistral Small 2402 (Bedrock) - Romance Companion",
        aliases: ["mistral-nemo-instruct-2407-romance", "mistral-roblox"],
        modelProviders: ["mistral.mistral-small-2402-v1:0"],
        price: costAsPrice("mistral.mistral-small-2402-v1:0"),
    },
    "deepseek-reasoning": {
        displayName: "DeepSeek R1 0528 (Bedrock)",
        aliases: ["deepseek-r1-0528"],
        modelProviders: ["us.deepseek.r1-v1:0"],
        price: costAsPrice("us.deepseek.r1-v1:0"),
    },
    "openai-audio": {
        displayName: "OpenAI GPT-4o Mini Audio Preview",
        aliases: ["gpt-4o-mini-audio-preview"],
        modelProviders: ["gpt-4o-mini-audio-preview-2024-12-17"],
        price: costAsPrice("gpt-4o-mini-audio-preview-2024-12-17"),
    },
    "nova-fast": {
        displayName: "Amazon Nova Micro (Bedrock)",
        aliases: ["nova-micro-v1"],
        modelProviders: ["amazon.nova-micro-v1:0"],
        price: costAsPrice("amazon.nova-micro-v1:0"),
    },
    "roblox-rp": {
        displayName: "Llama 3.1 8B Instruct (Cross-Region Bedrock)",
        aliases: ["llama-roblox", "llama-fast-roblox"],
        modelProviders: ["us.meta.llama3-1-8b-instruct-v1:0"],
        price: costAsPrice("us.meta.llama3-1-8b-instruct-v1:0"),
    },
    "claudyclaude": {
        displayName: "Claude 3.5 Haiku (Bedrock)",
        aliases: ["claude-3-5-haiku"],
        modelProviders: ["us.anthropic.claude-3-5-haiku-20241022-v1:0"],
        price: costAsPrice("us.anthropic.claude-3-5-haiku-20241022-v1:0"),
    },
    "openai-reasoning": {
        displayName: "OpenAI o4-mini (api.navy)",
        aliases: ["o4-mini"],
        modelProviders: ["openai/o4-mini"],
        price: costAsPrice("openai/o4-mini"),
    },
    "gemini": {
        displayName: "Gemini 2.5 Flash Lite (api.navy)",
        aliases: ["gemini-2.5-flash-lite"],
        modelProviders: ["google/gemini-2.5-flash-lite"],
        price: costAsPrice("google/gemini-2.5-flash-lite"),
    },
    "unity": {
        displayName: "Unity Unrestricted Agent",
        aliases: [],
        modelProviders: ["mistral-small-3.1-24b-instruct-2503"],
        price: costAsPrice("mistral-small-3.1-24b-instruct-2503"),
    },
    "mixera": {
        displayName: "Mixera AI Companion",
        aliases: [],
        modelProviders: ["gpt-4.1-2025-04-14"],
        price: costAsPrice("gpt-4.1-2025-04-14"),
    },
    "midijourney": {
        displayName: "MIDIjourney",
        aliases: [],
        modelProviders: ["gpt-4.1-2025-04-14"],
        price: costAsPrice("gpt-4.1-2025-04-14"),
    },
    "rtist": {
        displayName: "Rtist",
        aliases: [],
        modelProviders: ["gpt-4.1-2025-04-14"],
        price: costAsPrice("gpt-4.1-2025-04-14"),
    },
    "evil": {
        displayName: "Evil",
        aliases: [],
        modelProviders: ["mistral-small-3.1-24b-instruct-2503"],
        price: costAsPrice("mistral-small-3.1-24b-instruct-2503"),
    },
    "bidara": {
        displayName:
            "BIDARA (Biomimetic Designer and Research Assistant by NASA)",
        aliases: [],
        modelProviders: ["gpt-4.1-nano-2025-04-14"],
        price: costAsPrice("gpt-4.1-2025-04-14"),
    },
} as const satisfies ServiceRegistry<typeof TEXT_MODELS>;

function costAsPrice(
    modelProvider: keyof typeof TEXT_MODELS,
): UsageConversionDefinition[] {
    return TEXT_MODELS[modelProvider].cost;
}
