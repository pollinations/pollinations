import type {
    ModelProviderRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "@/registry/registry";

export const TEXT_MODELS = {
    "gpt-5-nano-2025-08-07": {
        displayName: "OpenAI GPT-5 Nano (Azure)",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.055,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.0055,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.44,
                },
            },
        ],
    },
    "gpt-4.1-2025-04-14": {
        displayName: "OpenAI GPT-4.1 (Azure)",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 1.91,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.48,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 7.64,
                },
            },
        ],
    },
    "gpt-4.1-nano-2025-04-14": {
        displayName: "OpenAI GPT-4.1 Nano (Azure)",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.055,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.0055,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.44,
                },
            },
        ],
    },
    "gpt-4o-mini-audio-preview-2024-12-17": {
        displayName: "OpenAI GPT-4o Mini Audio Preview (Azure)",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.1432,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.075,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.572793,
                },
                promptAudioTokens: {
                    unit: "DPMT",
                    rate: 9.5466,
                },
                completionAudioTokens: {
                    unit: "DPMT",
                    rate: 19.093079,
                },
            },
        ],
    },
    "qwen2.5-coder-32b-instruct": {
        displayName: "Qwen 2.5 Coder 32B (Scaleway)",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.4,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.1,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 1.6,
                },
            },
        ],
    },
    "mistral-small-3.1-24b-instruct-2503": {
        displayName: "Mistral Small 3.1 24B (Scaleway)",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.2,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.05,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.8,
                },
            },
        ],
    },
    "mistral.mistral-small-2402-v1:0": {
        displayName: "Mistral Small",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.2,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.05,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.8,
                },
            },
        ],
    },
    "us.deepseek.r1-v1:0": {
        displayName: "DeepSeek R1",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 1.35,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.3375,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 5.4,
                },
            },
        ],
    },
    "amazon.nova-micro-v1:0": {
        displayName: "Amazon Nova Micro (Bedrock)",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.035,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.009,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.14,
                },
            },
        ],
    },
    "us.meta.llama3-1-8b-instruct-v1:0": {
        displayName: "Meta Llama 3.1 8B Instruct (Bedrock)",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.15,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.0375,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.6,
                },
            },
        ],
    },
    "us.anthropic.claude-3-5-haiku-20241022-v1:0": {
        displayName: "Claude 3.5 Haiku (Bedrock)",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.8,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.2,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 4.0,
                },
            },
        ],
    },
    "openai/o4-mini": {
        displayName: "OpenAI o4 Mini (API Navy)",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
            },
        ],
    },
    "google/gemini-2.5-flash-lite": {
        displayName: "Google Gemini 2.5 Flash Lite (API Navy)",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
            },
        ],
    },
    "gemini-2.5-flash-lite-search": {
        displayName: "Google Gemini 2.5 Flash Lite Search",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.5,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.125,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 2.0,
                },
            },
        ],
    },
} as const satisfies ModelProviderRegistry;

export const TEXT_SERVICES = {
    "openai": {
        displayName: "OpenAI GPT-5 Nano",
        aliases: ["gpt-5-nano"],
        modelProviders: ["gpt-5-nano-2025-08-07"],
        price: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
            },
        ],
    },
    "openai-fast": {
        displayName: "OpenAI GPT-4.1 Nano",
        aliases: ["gpt-4.1-nano"],
        modelProviders: ["gpt-4.1-nano-2025-04-14"],
        price: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
            },
        ],
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
