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
    publisher: "OpenAI",
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
    "microsoft/mai-transcribe-2-streaming": {
        aliases: [],
        provider: "azure",
        publisher: "Microsoft",
        category: "realtime",
        addedDate: new Date("2026-10-08").getTime(),
        paidOnly: false,
        priceMultiplier: 0.75,
        // Introductory rate through 2026-12-31; subsequent rate is unpublished.
        cost: { promptAudioSeconds: 0.54 / 3600 },
        title: "MAI Transcribe 2 Streaming",
        description:
            "Transcribe multilingual speech live and receive each passage as its wording becomes final.",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        supportedEndpoints: ["/realtime", "/v1/realtime"],
    },
    [DEFAULT_REALTIME_MODEL]: {
        ...OPENAI_REALTIME_BASE,
        aliases: ["gpt-realtime-2.1", "gpt-realtime-2"],
        addedDate: new Date("2026-07-16").getTime(),
        // Azure retirement schedule; the model catalog says 2027-07-31.
        // Provider retires this route on 2027-06-25.
        cost: OPENAI_REALTIME_COST,
        billing: OPENAI_REALTIME_CACHE_BILLING,
        title: "GPT Realtime 2.1",
        description:
            "Have a live voice conversation and show the model images as you talk.",
        contextLength: 32000,
        paidOnly: false,
    },
    "openai/gpt-realtime-2.1-mini": {
        ...OPENAI_REALTIME_BASE,
        aliases: ["gpt-realtime-2.1-mini"],
        addedDate: new Date("2026-07-26").getTime(),
        // Azure retirement schedule; the model catalog says 2027-07-31.
        // Provider retires this route on 2027-06-25.
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
            "Build a lower-cost voice assistant that can call tools during a live conversation.",
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
    "elevenlabs/scribe-v3-live": {
        aliases: [],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
        category: "realtime",
        addedDate: new Date("2026-11-10").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // https://elevenlabs.io/pricing/api — base transcription, no paid extras.
        cost: { promptAudioSeconds: 0.22 / 3600 },
        title: "Scribe v3 Live",
        description:
            "Caption multilingual speech as it happens, with interim text that updates as the speaker continues.",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        supportedEndpoints: ["/realtime", "/v1/realtime"],
    },
    "elevenlabs/scribe-v2-realtime": {
        aliases: ["scribe-realtime"],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
        category: "realtime",
        addedDate: new Date("2026-08-13").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // ElevenLabs Scale API plan: $0.22 per streamed audio hour (2026-11-10).
            promptAudioSeconds: 0.22 / 3600,
        },
        title: "Scribe v2 Realtime",
        description:
            "Display live captions in over 90 languages as the speaker talks.",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        supportedEndpoints: ["/realtime", "/v1/realtime"],
    },
    "openai/gpt-live-transcribe": {
        aliases: ["gpt-live-transcribe"],
        provider: "azure",
        publisher: "OpenAI",
        category: "realtime",
        addedDate: new Date("2026-08-19").getTime(),
        // Provider retires this route on 2028-02-01.
        paidOnly: false,
        priceMultiplier: 0.75,
        cost: {
            // Provisional OpenAI list price: $0.017 per streamed input minute.
            // Azure's exact meter was not yet visible when this route launched.
            promptAudioSeconds: 0.017 / 60,
        },
        title: "GPT Live Transcribe",
        description:
            "Turn incoming speech into a live transcript with little delay.",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        supportedEndpoints: ["/realtime", "/v1/realtime"],
    },
} satisfies Record<string, ModelDefinition>;

export const REALTIME_MODEL_NAMES = Object.keys(
    REALTIME_SERVICES,
) as RealtimeModelName[];
