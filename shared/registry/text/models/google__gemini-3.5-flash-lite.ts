import {
    GEMINI_3_SEARCH_BILLING,
    withVertexCacheStorage,
} from "../../gemini-billing";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemini-3.5-flash-lite";

export default {
    supportedParameters: CHAT_PARAMETERS.vertexGemini35,
    aliases: [
        "gemini-flash-lite-3.1",
        "gemini-3.1-flash-lite",
        "gemini-3.1-flash-lite-preview",
        "gemini-flash-lite",
        "gemini-3.5-flash-lite",
        "gemini-flash-lite-3.5",
    ],
    provider: "google",
    publisher: "Google",
    category: "text",
    addedDate: new Date("2026-04-03").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        promptTextTokens: perMillion(0.3),
        promptCachedTokens: perMillion(0.03),
        promptCacheWriteTokens: perMillion(0.3),
        promptAudioTokens: perMillion(0.3),
        promptImageTokens: perMillion(0.3),
        promptVideoTokens: perMillion(0.3),
        completionTextTokens: perMillion(2.5),
    },
    billing: withVertexCacheStorage(GEMINI_3_SEARCH_BILLING, 1.0),
    title: "Gemini 3.5 Flash Lite",
    description:
        "Fast multimodal reasoning for high-throughput agents and data processing",
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 3600, // Gemini API image-understanding file limit.
    maxReferenceVideos: 10, // Gemini API video-understanding upload limit.
    tools: true,
    search: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
