import {
    OPENAI_REALTIME_2_1_MINI_CACHE_BILLING,
    OPENAI_REALTIME_CACHE_BILLING,
} from "./realtime-billing";
import type { ModelDefinition } from "./registry";

export const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1" as const;
export type RealtimeModelName = keyof typeof REALTIME_SERVICES;

const OPENAI_REALTIME_BASE = {
    aliases: [],
    provider: "azure",
    brand: "OpenAI",
    category: "realtime",
    priceMultiplier: 0.75,
    inputModalities: ["text", "audio", "image"],
    outputModalities: ["text", "audio"],
    tools: true,
    reasoning: true,
} satisfies Partial<ModelDefinition>;

const OPENAI_REALTIME_COST = {
    promptTextTokens: 0.000004,
    promptCachedTokens: 0.0000004,
    promptAudioTokens: 0.000032,
    promptImageTokens: 0.000005,
    completionTextTokens: 0.000024,
    completionAudioTokens: 0.000064,
} satisfies ModelDefinition["cost"];

export const REALTIME_SERVICES = {
    [DEFAULT_REALTIME_MODEL]: {
        ...OPENAI_REALTIME_BASE,
        aliases: ["gpt-realtime-2.1"],
        addedDate: new Date("2026-07-16").getTime(),
        cost: OPENAI_REALTIME_COST,
        billing: OPENAI_REALTIME_CACHE_BILLING,
        title: "GPT Realtime 2.1",
        description:
            "Live voice conversations with instant replies and solid noise handling",
        contextLength: 32000,
    },
    "openai/gpt-realtime-2.1-mini": {
        ...OPENAI_REALTIME_BASE,
        aliases: ["gpt-realtime-2.1-mini"],
        addedDate: new Date("2026-07-26").getTime(),
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
        ...OPENAI_REALTIME_BASE,
        aliases: ["gpt-realtime-2"],
        addedDate: new Date("2026-05-23").getTime(),
        cost: OPENAI_REALTIME_COST,
        billing: OPENAI_REALTIME_CACHE_BILLING,
        title: "GPT Realtime 2",
        description: "Live voice conversations with instant, reasoned replies",
        contextLength: 128000,
    },
    "scribe-realtime": {
        aliases: [],
        provider: "elevenlabs",
        brand: "ElevenLabs",
        category: "realtime",
        addedDate: new Date("2026-08-13").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // ElevenLabs Scribe v2 Realtime: $0.39 per streamed audio hour.
            promptAudioSeconds: 0.39 / 3600,
        },
        title: "Scribe v2 Realtime",
        description:
            "Live transcription in 90+ languages with incremental and final results",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        supportedEndpoints: ["/realtime", "/v1/realtime"],
    },
} satisfies Record<string, ModelDefinition>;

export const REALTIME_MODEL_NAMES = Object.keys(
    REALTIME_SERVICES,
) as RealtimeModelName[];
