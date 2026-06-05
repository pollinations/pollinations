import type { ModelDefinition } from "./registry";

export const DEFAULT_REALTIME_MODEL = "gpt-realtime-2" as const;
export type RealtimeModelName = keyof typeof REALTIME_SERVICES;
export type RealtimeModelId =
    (typeof REALTIME_SERVICES)[RealtimeModelName]["modelId"];

export const REALTIME_SERVICES = {
    [DEFAULT_REALTIME_MODEL]: {
        aliases: [],
        modelId: DEFAULT_REALTIME_MODEL,
        provider: "azure",
        brand: "OpenAI",
        category: "realtime",
        addedDate: new Date("2026-05-23").getTime(),
        priceMultiplier: 1,
        cost: {
            promptTextTokens: 0.000004,
            promptCachedTokens: 0.0000004,
            promptAudioTokens: 0.000032,
            promptImageTokens: 0.000005,
            completionTextTokens: 0.000024,
            completionAudioTokens: 0.000064,
        },
        title: "GPT Realtime 2",
        description: "realtime voice reasoning",
        inputModalities: ["text", "audio", "image"],
        outputModalities: ["text", "audio"],
        tools: true,
        reasoning: true,
        contextLength: 128000,
    },
} satisfies Record<string, ModelDefinition<string>>;
