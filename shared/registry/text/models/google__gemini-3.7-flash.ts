import {
    GEMINI_3_SEARCH_BILLING,
    withVertexCacheStorage,
} from "../../gemini-billing";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemini-3.7-flash";

export default {
    supportedParameters: CHAT_PARAMETERS.vertexGemini35,
    aliases: ["gemini-3.6-flash", "gemini-3.5-flash", "gemini"],
    provider: "google",
    publisher: "Google",
    category: "text",
    addedDate: new Date("2026-05-19").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // Google's promotional pricing runs through 2026-12-31; list rates
    // double on 2027-01-01 and need another update then.
    cost: {
        promptTextTokens: perMillion(0.75),
        promptCachedTokens: perMillion(0.075),
        promptCacheWriteTokens: perMillion(0.75),
        promptAudioTokens: perMillion(0.75),
        promptImageTokens: perMillion(0.75),
        promptVideoTokens: perMillion(0.75),
        completionTextTokens: perMillion(3.75),
    },
    billing: withVertexCacheStorage(GEMINI_3_SEARCH_BILLING, 0.5),
    title: "Gemini 3.7 Flash",
    description:
        "Sharp, fast reasoning over text, images, audio and video, plus web search",
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 3600, // Gemini API image-understanding file limit.
    maxReferenceVideos: 10, // Gemini API video-understanding upload limit.
    tools: true,
    search: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
