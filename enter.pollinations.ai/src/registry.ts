const units = {
    DPMT: {
        description: "dollars per million tokens",
    },
} as const;

type Unit = keyof typeof units;

const usageTypes = {
    promptTokens: {
        description: "number of tokens in the input prompt",
    },
    cachedPromptTokens: {
        description: "number of cached tokens in the input prompt",
    },
    completionTokens: {
        description: "number of tokens in the generated completion",
    },
} as const;

type UsageType = keyof typeof usageTypes;

type ConversionRate = {
    unit: Unit;
    amount: number;
};

type CostDefinition = {
    date: number;
} & { [K in UsageType]: ConversionRate };

type PriceDefinition = {
    date: number;
} & { [K in UsageType]: ConversionRate };

type ServiceDefinition = {
    displayName: string;
    originalName: string;
    aliases: string[];
    cost: CostDefinition[];
    price: PriceDefinition[];
};

type ServiceRegistry = { [key: string]: ServiceDefinition };

const registry = {
    "openai": {
        displayName: "OpenAI GPT-4.1 Nano",
        originalName: "gpt-4.1-nano-2025-04-14",
        aliases: ["gpt-4.1-nano"],
        cost: [
            {
                date: new Date("2024-08-01 00:00:00").getTime(),
                promptTokens: {
                    unit: "DPMT",
                    amount: 0.1,
                },
                cachedPromptTokens: {
                    unit: "DPMT",
                    amount: 0.03,
                },
                completionTokens: {
                    unit: "DPMT",
                    amount: 0.39,
                },
            },
        ],
        price: [
            {
                date: new Date("2024-08-01 00:00:00").getTime(),
                promptTokens: {
                    unit: "DPMT",
                    amount: 0.0,
                },
                cachedPromptTokens: {
                    unit: "DPMT",
                    amount: 0.0,
                },
                completionTokens: {
                    unit: "DPMT",
                    amount: 0.0,
                },
            },
        ],
    },
} as const satisfies ServiceRegistry;
