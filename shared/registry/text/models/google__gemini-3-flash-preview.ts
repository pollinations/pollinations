import {
    GEMINI_3_SEARCH_BILLING,
    withVertexCacheStorage,
} from "../../gemini-billing";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemini-3-flash-preview";

export default {
    supportedParameters: CHAT_PARAMETERS.vertexGemini3,
    aliases: ["gemini-3-flash-preview", "gemini-3-flash"],
    provider: "google",
    publisher: "Google",
    category: "text",
    addedDate: new Date("2025-10-07").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        promptTextTokens: perMillion(0.5),
        promptCachedTokens: perMillion(0.05),
        promptCacheWriteTokens: perMillion(0.5),
        promptAudioTokens: perMillion(1.0),
        promptImageTokens: perMillion(0.5),
        promptVideoTokens: perMillion(0.5),
        completionTextTokens: perMillion(3.0),
    },
    billing: withVertexCacheStorage(GEMINI_3_SEARCH_BILLING, 1.0),
    title: "Gemini 3 Flash Preview",
    description:
        "Pro-grade reasoning at high speed, with web search and a huge context window",
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 3600, // Gemini API image-understanding file limit.
    maxReferenceVideos: 10, // Gemini API video-understanding upload limit.
    tools: true,
    search: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
