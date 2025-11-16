import type { ModelRegistry } from "./registry";
import { COST_START_DATE, perMillion } from "./price-helpers";

export const DEFAULT_TEXT_MODEL = "openai" as const;

export const TEXT_SERVICES = {
    "openai": {
        aliases: ["gpt-5-mini"],
        modelId: "gpt-5-mini-2025-08-07", // Provider returns this - used for cost lookup
        provider: "azure-openai",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.25),
                promptCachedTokens: perMillion(0.025),
                completionTextTokens: perMillion(2.0),
            },
        ],
    },
    "openai-fast": {
        aliases: ["gpt-5-nano"],
        modelId: "gpt-5-nano-2025-08-07",
        provider: "azure-openai",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.05),
                promptCachedTokens: perMillion(0.005),
                completionTextTokens: perMillion(0.4),
            },
        ],
    },
    "openai-large": {
        aliases: ["gpt-5-chat"],
        modelId: "gpt-5-chat-latest",
        provider: "azure-openai",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.25),
                promptCachedTokens: perMillion(0.13),
                completionTextTokens: perMillion(10.0),
            },
        ],
    },
    "qwen-coder": {
        aliases: ["qwen2.5-coder-32b-instruct"],
        modelId: "qwen2.5-coder-32b-instruct",
        provider: "scaleway",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.9),
                completionTextTokens: perMillion(0.9),
            },
        ],
    },
    "mistral": {
        aliases: ["mistral-small"],
        modelId: "mistral-small-3.2-24b-instruct-2506",
        provider: "scaleway",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.15),
                completionTextTokens: perMillion(0.35),
            },
        ],
    },
    "mistral-fast": {
        aliases: ["llama-3.1-8b", "llama-fast"],
        modelId: "us.meta.llama3-1-8b-instruct-v1:0",
        provider: "aws-bedrock",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.22),
                completionTextTokens: perMillion(0.22),
            },
        ],
    },
    // Temporarily disabled
    // "naughty": {
    //     aliases: ["mistral-naughty", "mistral-romance", "mistral-nemo-instruct-2407-romance", "mistral-roblox"],
    //     modelId: "mistral-nemo-instruct-2407",
    //     provider: "scaleway",
    // },
    "openai-audio": {
        aliases: ["gpt-4o-mini-audio-preview"],
        modelId: "gpt-4o-mini-audio-preview-2024-12-17",
        provider: "azure-openai",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.165),
                completionTextTokens: perMillion(0.66),
                promptAudioTokens: perMillion(11.0),
                completionAudioTokens: perMillion(22.0),
            },
        ],
    },
    "openai-reasoning": {
        aliases: ["o4-mini"],
        modelId: "openai/o4-mini",
        provider: "api-navy",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.21),
                promptCachedTokens: perMillion(0.31),
                completionTextTokens: perMillion(4.84),
            },
        ],
    },
    "gemini": {
        aliases: ["gemini-2.5-flash-lite"],
        modelId: "gemini-2.5-flash-lite",
        provider: "vertex-ai",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.1),
                promptCachedTokens: perMillion(0.01),
                completionTextTokens: perMillion(0.4),
            },
        ],
    },
    "deepseek": {
        aliases: [
            "deepseek-v3",
            "deepseek-v3.1",
            "deepseek-reasoning",
            "deepseek-r1-0528",
        ],
        modelId: "myceli-deepseek-v3.1",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.25),
                completionTextTokens: perMillion(5.0),
            },
        ],
    },
    "grok": {
        aliases: ["grok-fast", "grok-4", "grok-4-fast"],
        modelId: "myceli-grok-4-fast",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.2),
                completionTextTokens: perMillion(0.5),
            },
        ],
    },
    "gemini-search": {
        aliases: ["searchgpt", "geminisearch"],
        modelId: "gemini-2.5-flash-lite",
        provider: "vertex-ai",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.1),
                promptCachedTokens: perMillion(0.01),
                completionTextTokens: perMillion(0.4),
            },
        ],
    },
    "chickytutor": {
        aliases: [],
        modelId: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
        provider: "aws-bedrock",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.8),
                completionTextTokens: perMillion(4.0),
            },
        ],
    },
    "midijourney": {
        aliases: [],
        modelId: "gpt-4.1-2025-04-14",
        provider: "azure-openai",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.2),
                promptCachedTokens: perMillion(0.55),
                completionTextTokens: perMillion(8.8),
            },
        ],
    },
    // Temporarily disabled
    // "evil": {
    //     aliases: [],
    //     modelId: "mistral-small-3.1-24b-instruct-2503",
    //     provider: "scaleway",
    // },
    "claude": {
        aliases: ["claudyclaude"],
        modelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        provider: "aws-bedrock",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.0),
                completionTextTokens: perMillion(5.0),
            },
        ],
    },
    "claude-large": {
        aliases: ["sonnet", "claude-4.5", "claude-sonnet-4.5", "claude-sonnet"],
        modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        provider: "aws-bedrock",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(3.0),
                completionTextTokens: perMillion(15.0),
            },
        ],
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
    },
    "perplexity-reasoning": {
        aliases: ["sonar-reasoning"],
        modelId: "sonar-reasoning",
        provider: "perplexity",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.0),
                completionTextTokens: perMillion(5.0),
            },
        ],
    },
} as const;

// Backward compatibility - auto-generate TEXT_COSTS from service definitions
export const TEXT_COSTS = Object.fromEntries(
    Object.entries(TEXT_SERVICES).map(([_name, service]) => [
        service.modelId,
        [...service.cost],
    ]),
) as ModelRegistry;
