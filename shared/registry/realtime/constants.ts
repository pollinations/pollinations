// Default realtime model and the shared OpenAI realtime rate sheet, kept free
// of catalog access.
import type { ModelDefinition } from "../registry";

export const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1" as const;
export const OPENAI_REALTIME_BASE = {
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

export const OPENAI_REALTIME_COST = {
    promptTextTokens: 0.000004,
    promptCachedTokens: 0.0000004,
    promptAudioTokens: 0.000032,
    promptImageTokens: 0.000005,
    completionTextTokens: 0.000024,
    completionAudioTokens: 0.000064,
} satisfies ModelDefinition["cost"];
