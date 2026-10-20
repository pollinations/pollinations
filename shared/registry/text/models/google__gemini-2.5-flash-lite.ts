import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemini-2.5-flash-lite";

export default {
    supportedParameters: CHAT_PARAMETERS.vertexGemini25,
    aliases: ["gemini-2.5-flash-lite", "gemini-fast"],
    provider: "vercel",
    publisher: "Google",
    category: "text",
    addedDate: new Date("2025-12-18").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        promptTextTokens: perMillion(0.1), // per 1M tokens
        promptCachedTokens: perMillion(0.01), // per 1M tokens
        promptCacheWriteTokens: perMillion(0.1), // per 1M tokens
        promptAudioTokens: perMillion(0.1), // per 1M tokens
        promptImageTokens: perMillion(0.1), // per 1M tokens
        promptVideoTokens: perMillion(0.1), // per 1M tokens
        completionTextTokens: perMillion(0.4), // per 1M tokens
    },
    title: "Gemini 2.5 Flash Lite",
    description:
        "Cheapest way to handle everyday multimodal tasks; trades depth for speed",
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 3600, // Gemini API image-understanding file limit.
    maxReferenceVideos: 10, // Gemini API video-understanding upload limit.
    tools: true,
    search: false,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
