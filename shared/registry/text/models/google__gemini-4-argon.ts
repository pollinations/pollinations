import { GEMINI_3_SEARCH_BILLING } from "../../gemini-billing";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemini-4-argon";

export default {
    supportedParameters: CHAT_PARAMETERS.vertexGemini35,
    aliases: [],
    provider: "google",
    publisher: "Google",
    category: "text",
    addedDate: new Date("2026-10-13").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // Vertex global list rates (2026-10-13). Vertex invoices these and
    // returns 50% as credits through 2026-11-30; that promo is not priced in.
    cost: {
        promptTextTokens: perMillion(4),
        promptCachedTokens: perMillion(0.2),
        promptCacheWriteTokens: perMillion(4),
        promptAudioTokens: perMillion(4),
        promptImageTokens: perMillion(4),
        promptVideoTokens: perMillion(4),
        completionTextTokens: perMillion(20),
    },
    billing: GEMINI_3_SEARCH_BILLING,
    title: "Gemini 4 Argon",
    description:
        "Flagship reasoning over text, images, audio and video, with web search",
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 3600, // Gemini API image-understanding file limit.
    maxReferenceVideos: 10, // Gemini API video-understanding upload limit.
    tools: true,
    search: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
