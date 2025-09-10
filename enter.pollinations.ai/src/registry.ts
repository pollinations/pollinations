import { omit } from "./util.ts";

const UNITS = {
    DPMT: {
        description: "dollars per million tokens",
        convert: (tokens: number, rate: number): number => {
            return (tokens / 1_000_000) * rate;
        },
    },
} as const;

type Unit = keyof typeof UNITS;

const USAGE_TYPES = {
    promptTextTokens: {
        description: "number of text tokens in the input prompt",
    },
    promptCachedTokens: {
        description: "number of cached tokens in the input prompt",
    },
    promptAudioTokes: {
        description: "number of audio tokens in the input prompt",
    },
    promptImageTokens: {
        description: "number of image tokens in the input prompt",
    },
    completionTextTokens: {
        description: "number of text tokens in the generated completion",
    },
    completionAudioTokens: {
        description: "number of audio tokens in the generated completion",
    },
    completionImageTokens: {
        description: "number of image tokens in the generated completion",
    },
} as const;

export type UsageType = keyof typeof USAGE_TYPES;

export type TokenUsage = {
    unit: "TOKENS";
} & { [K in UsageType]?: number };

export type DollarConvertedUsage = {
    unit: "USD";
} & { [K in UsageType]?: number };

export type UsageCost = DollarConvertedUsage & {
    totalCost: number;
};

export type UsagePrice = DollarConvertedUsage & {
    totalPrice: number;
};

export type UsageConversionRate = {
    unit: Unit;
    rate: number;
};

export type UsageConversionDefinition = {
    date: number;
} & { [K in UsageType]?: UsageConversionRate };

export type PriceDefinition = UsageConversionDefinition;
export type CostDefinition = UsageConversionDefinition;

export type ModelProviderDefinition = {
    displayName: string;
    cost: CostDefinition[];
};

export type ModelProviderRegistry = {
    [Key in string]: ModelProviderDefinition;
};

export type ServiceDefinition<T extends ModelProviderRegistry> = {
    displayName: string;
    aliases: string[];
    modelProviders: (keyof T)[];
    price: PriceDefinition[];
};

export type ServiceRegistry<T extends ModelProviderRegistry> = {
    [Key in string]: ServiceDefinition<T>;
};

export type ServiceMargins = {
    [Key in string]: {
        [Key in UsageType]?: number;
    };
};

/** Sorts the cost and price definitions by date, in descending order */
function sortDefinitions<T extends UsageConversionDefinition>(
    definitions: T[],
): T[] {
    return definitions.sort((a, b) => b.date - a.date);
}

const MODELS = {
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
                promptAudioTokes: {
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

const SERVICES = {
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
    "qwen-coder": {
        displayName: "Qwen 2.5 Coder 32B",
        aliases: ["qwen2.5-coder-32b-instruct"],
        modelProviders: ["qwen2.5-coder-32b-instruct"],
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
    "mistral": {
        displayName: "Mistral Small 3.1 24B",
        aliases: ["mistral-small-3.1-24b-instruct"],
        modelProviders: ["mistral-small-3.1-24b-instruct-2503"],
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
    "mistral-romance": {
        displayName: "Mistral Small 2402 (Bedrock) - Romance Companion",
        aliases: ["mistral-nemo-instruct-2407-romance", "mistral-roblox"],
        modelProviders: ["mistral.mistral-small-2402-v1:0"],
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
    "deepseek-reasoning": {
        displayName: "DeepSeek R1 0528 (Bedrock)",
        aliases: ["deepseek-r1-0528"],
        modelProviders: ["us.deepseek.r1-v1:0"],
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
    "openai-audio": {
        displayName: "OpenAI GPT-4o Mini Audio Preview",
        aliases: ["gpt-4o-mini-audio-preview"],
        modelProviders: ["gpt-4o-mini-audio-preview-2024-12-17"],
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
                promptAudioTokes: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                completionAudioTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
            },
        ],
    },
    "nova-fast": {
        displayName: "Amazon Nova Micro (Bedrock)",
        aliases: ["nova-micro-v1"],
        modelProviders: ["amazon.nova-micro-v1:0"],
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
    "roblox-rp": {
        displayName: "Llama 3.1 8B Instruct (Cross-Region Bedrock)",
        aliases: ["llama-roblox", "llama-fast-roblox"],
        modelProviders: ["us.meta.llama3-1-8b-instruct-v1:0"],
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
    "claudyclaude": {
        displayName: "Claude 3.5 Haiku (Bedrock)",
        aliases: ["claude-3-5-haiku"],
        modelProviders: ["us.anthropic.claude-3-5-haiku-20241022-v1:0"],
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
    "openai-reasoning": {
        displayName: "OpenAI o4-mini (api.navy)",
        aliases: ["o4-mini"],
        modelProviders: ["openai/o4-mini"],
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
    "gemini": {
        displayName: "Gemini 2.5 Flash Lite (api.navy)",
        aliases: ["gemini-2.5-flash-lite"],
        modelProviders: ["google/gemini-2.5-flash-lite"],
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
    "unity": {
        displayName: "Unity Unrestricted Agent",
        aliases: [],
        modelProviders: ["mistral-small-3.1-24b-instruct-2503"],
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
    "mixera": {
        displayName: "Mixera AI Companion",
        aliases: [],
        modelProviders: ["gpt-4.1-2025-04-14"],
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
    "midijourney": {
        displayName: "MIDIjourney",
        aliases: [],
        modelProviders: ["gpt-4.1-2025-04-14"],
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
    "rtist": {
        displayName: "Rtist",
        aliases: [],
        modelProviders: ["gpt-4.1-2025-04-14"],
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
    "evil": {
        displayName: "Evil",
        aliases: [],
        modelProviders: ["mistral-small-3.1-24b-instruct-2503"],
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
    "bidara": {
        displayName:
            "BIDARA (Biomimetic Designer and Research Assistant by NASA)",
        aliases: [],
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
} as const satisfies ServiceRegistry<typeof MODELS>;

function getActiveCostDefinition<TP extends ModelProviderRegistry>(
    providerRegistry: TP,
    provider: keyof TP,
    date: Date = new Date(),
): CostDefinition | null {
    const providerDefinition = providerRegistry[provider];
    if (!providerDefinition) return null;
    for (const definition of providerDefinition.cost) {
        if (definition.date < date.getTime()) return definition;
    }
    return null;
}

function getActivePriceDefinition<
    TP extends ModelProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(
    serviceRegistry: TS,
    service: keyof TS,
    date: Date = new Date(),
): PriceDefinition | null {
    const serviceDefinition = serviceRegistry[service];
    if (!serviceDefinition) return null;
    for (const definition of serviceDefinition.price) {
        if (definition.date < date.getTime()) return definition;
    }
    return null;
}

function convertUsage(
    usage: TokenUsage,
    conversionDefinition: UsageConversionDefinition,
): DollarConvertedUsage {
    const amounts = omit(usage, "unit");
    const convertedUsage = Object.fromEntries(
        Object.entries(amounts).map(([usageType, amount]) => {
            const conversionRate = conversionDefinition[usageType as UsageType];
            if (!conversionRate) {
                throw new Error(
                    `Failed to get conversion rate for usage type: ${usageType}`,
                );
            }
            const unit = UNITS[conversionRate.unit];
            if (!unit) {
                throw new Error(
                    `Failed to get conversion unit: ${conversionRate.unit}`,
                );
            }
            const rate = conversionRate.rate;
            const usageTypeCost = unit.convert(amount, rate);
            return [usageType, usageTypeCost];
        }),
    );
    return {
        unit: "USD",
        ...convertedUsage,
    };
}

function calculateCost<TP extends ModelProviderRegistry>(
    providerRegistry: TP,
    provider: keyof TP,
    usage: TokenUsage,
): UsageCost {
    const currentCost = getActiveCostDefinition<TP>(providerRegistry, provider);
    if (!currentCost)
        throw new Error(
            `Failed to get current cost for provider: ${provider.toString()}`,
        );
    const usageCost = convertUsage(usage, currentCost);
    const totalCost = Object.values(omit(usageCost, "unit")).reduce(
        (total, cost) => total + cost,
    );
    return {
        ...usageCost,
        totalCost,
    };
}

function calculatePrice<
    TP extends ModelProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(serviceRegistry: TS, service: keyof TS, usage: TokenUsage): UsagePrice {
    const currentPrice = getActivePriceDefinition<TP, TS>(
        serviceRegistry,
        service,
    );
    if (!currentPrice)
        throw new Error(
            `Failed to get current price for service: ${service.toString()}`,
        );
    const usagePrice = convertUsage(usage, currentPrice);
    const totalPrice = Object.values(omit(usagePrice, "unit")).reduce(
        (total, price) => total + price,
    );
    return {
        ...usagePrice,
        totalPrice,
    };
}

function isFreeService<
    TP extends ModelProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(serviceRegistry: TS, service: keyof TS): boolean {
    const servicPriceDefinition = getActivePriceDefinition<TP, TS>(
        serviceRegistry,
        service,
    );
    if (!servicPriceDefinition)
        throw new Error(
            `Failed to get current price for servce: ${service.toString()}`,
        );
    return Object.values(omit(servicPriceDefinition, "date")).every(
        (definition) => definition.rate === 0,
    );
}

function calculateMargins<
    TP extends ModelProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(providers: TP, services: TS, service: keyof TS): ServiceMargins {
    const serviceDefinition = services[service];
    const servicePriceDefinition = getActivePriceDefinition<TP, TS>(
        services,
        service,
    );
    if (!servicePriceDefinition)
        throw new Error(
            `Failed to find price definition for service: ${service.toString()}`,
        );
    return Object.fromEntries(
        serviceDefinition.modelProviders.map((provider) => {
            const costDefinition = getActiveCostDefinition(providers, provider);
            if (!costDefinition)
                throw new Error(
                    `Failed to find cost definition for provider: ${provider.toString()}`,
                );
            return [
                provider,
                Object.fromEntries(
                    Object.keys(omit(costDefinition, "date")).map(
                        (usageType) => {
                            const usageCost =
                                costDefinition[usageType as UsageType];
                            const usagePrice =
                                servicePriceDefinition[usageType as UsageType];
                            if (!usageCost || !usagePrice) {
                                throw new Error(
                                    `Failed to find usage cost or price for provider: ${provider.toString()}`,
                                );
                            }
                            if (usageCost.unit !== usagePrice.unit) {
                                throw new Error(
                                    `Usage cost and price units do not match for provider: ${provider.toString()}`,
                                );
                            }
                            return [
                                usageType,
                                usagePrice.rate - usageCost.rate,
                            ];
                        },
                    ),
                ),
            ];
        }),
    );
}

export function createRegistry<
    TP extends ModelProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(providers: TP, services: TS) {
    const providerRegistry = Object.fromEntries(
        Object.entries(providers).map(([name, provider]) => [
            name,
            {
                ...provider,
                cost: sortDefinitions(provider.cost),
            },
        ]),
    ) as TP;

    const serviceRegistry = Object.fromEntries(
        Object.entries(services).map(([name, service]) => [
            name,
            {
                ...service,
                price: sortDefinitions(service.price),
            },
        ]),
    ) as TS;

    return {
        isFreeService: (service: keyof typeof services) =>
            isFreeService<TP, TS>(serviceRegistry, service),
        getActiveCostDefinition: (provider: keyof typeof providers) =>
            getActiveCostDefinition<TP>(providerRegistry, provider),
        getActivePriceDefinition: (service: keyof typeof services) =>
            getActivePriceDefinition<TP, TS>(serviceRegistry, service),
        calculateCost: (provider: keyof typeof providers, usage: TokenUsage) =>
            calculateCost<TP>(providerRegistry, provider, usage),
        calculatePrice: (service: keyof typeof services, usage: TokenUsage) =>
            calculatePrice<TP, TS>(serviceRegistry, service, usage),
        calculateMargins: (service: keyof typeof services) =>
            calculateMargins<TP, TS>(
                providerRegistry,
                serviceRegistry,
                service,
            ),
    };
}

export const REGISTRY = createRegistry(MODELS, SERVICES);
export type ServiceId = keyof typeof SERVICES;
export type ProviderId = keyof typeof MODELS;
