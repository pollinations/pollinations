import {
    OPENAI_REALTIME_2_1_MINI_CACHE_BILLING,
    OPENAI_REALTIME_CACHE_BILLING,
} from "./realtime-billing";
import type { ModelDefinition } from "./registry";

export const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1" as const;
export type RealtimeModelName = keyof typeof REALTIME_SERVICES;

export const REALTIME_SERVICES = {
    [DEFAULT_REALTIME_MODEL]: {
        aliases: ["gpt-realtime-2.1"],
        provider: "azure",
        brand: "OpenAI",
        category: "realtime",
        addedDate: new Date("2026-07-16").getTime(),
        priceMultiplier: 0.75,
        cost: {
            promptTextTokens: 0.000004,
            promptCachedTokens: 0.0000004,
            promptAudioTokens: 0.000032,
            promptImageTokens: 0.000005,
            completionTextTokens: 0.000024,
            completionAudioTokens: 0.000064,
        },
        billing: OPENAI_REALTIME_CACHE_BILLING,
        title: "GPT Realtime 2.1",
        description:
            "Live voice conversations with instant replies and solid noise handling",
        inputModalities: ["text", "audio", "image"],
        outputModalities: ["text", "audio"],
        tools: true,
        reasoning: true,
        contextLength: 32000,
    },
    "openai/gpt-realtime-2.1-mini": {
        aliases: ["gpt-realtime-2.1-mini"],
        provider: "azure",
        brand: "OpenAI",
        category: "realtime",
        addedDate: new Date("2026-07-26").getTime(),
        priceMultiplier: 0.75,
        paidOnly: false,
        cost: {
            promptTextTokens: 0.0000006,
            promptCachedTokens: 0.00000006,
            promptAudioTokens: 0.00001,
            promptImageTokens: 0.0000008,
            completionTextTokens: 0.0000024,
            completionAudioTokens: 0.00002,
        },
        billing: OPENAI_REALTIME_2_1_MINI_CACHE_BILLING,
        title: "GPT Realtime 2.1 Mini",
        description:
            "Cost-efficient live voice conversations with fast, reasoned replies and tool use",
        inputModalities: ["text", "audio", "image"],
        outputModalities: ["text", "audio"],
        tools: true,
        reasoning: true,
        contextLength: 128000,
        voices: [
            "alloy",
            "ash",
            "ballad",
            "coral",
            "echo",
            "sage",
            "shimmer",
            "verse",
            "marin",
            "cedar",
        ],
    },
    "openai/gpt-realtime-2": {
        aliases: ["gpt-realtime-2"],
        provider: "azure",
        brand: "OpenAI",
        category: "realtime",
        addedDate: new Date("2026-05-23").getTime(),
        priceMultiplier: 0.75,
        cost: {
            promptTextTokens: 0.000004,
            promptCachedTokens: 0.0000004,
            promptAudioTokens: 0.000032,
            promptImageTokens: 0.000005,
            completionTextTokens: 0.000024,
            completionAudioTokens: 0.000064,
        },
        billing: OPENAI_REALTIME_CACHE_BILLING,
        title: "GPT Realtime 2",
        description: "Live voice conversations with instant, reasoned replies",
        inputModalities: ["text", "audio", "image"],
        outputModalities: ["text", "audio"],
        tools: true,
        reasoning: true,
        contextLength: 128000,
    },
} satisfies Record<string, ModelDefinition>;

export const REALTIME_MODEL_NAMES = Object.keys(
    REALTIME_SERVICES,
) as RealtimeModelName[];
