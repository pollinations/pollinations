import {
    openRouterGeminiBilling,
    reportedTextCost,
} from "../../gemini-billing";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemini-2.5-flash-lite:search";

export default {
    supportedParameters: [...CHAT_PARAMETERS.gemini25, "reasoning_effort"],
    aliases: [
        "gemini-2.5-flash-search",
        "gemini-2.5-flash-lite-search",
        "gemini-search-fast",
        "gemini-3.1-flash-lite-search",
        "gemini-3.5-flash-lite-search",
        "gemini-search-large",
        "gemini-3.6-flash-search",
        "gemini-3.5-flash-search",
        "gemini-search",
    ],
    provider: "openrouter",
    publisher: "Google",
    category: "text",
    addedDate: new Date("2025-10-10").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // AI Studio rates plus the OpenRouter credit-purchase fee.
    cost: {
        promptTextTokens: perMillion(0.1) * 1.055,
        promptCachedTokens: perMillion(0.01) * 1.055,
        promptCacheWriteTokens: perMillion(0.1) * 1.055,
        promptAudioTokens: perMillion(0.3) * 1.055,
        promptImageTokens: perMillion(0.1) * 1.055,
        promptVideoTokens: perMillion(0.1) * 1.055,
        completionTextTokens: perMillion(0.4) * 1.055,
    },
    billing: {
        ...openRouterGeminiBilling({
            searchCostPerThousandRequests: 7 * 1.055,
            storageCostPerMillionTokenHours: 1 * 1.055,
        }),
        resolveTotalCost: reportedTextCost(1.055),
    },
    title: "Google Gemini 2.5 Flash Lite Search",
    description:
        "Answers grounded in live web search; fast and cheap, not a deep reasoner",
    inputModalities: ["text", "image", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 3600, // Gemini API image-understanding file limit.
    maxReferenceVideos: 10, // Gemini API video-understanding upload limit.
    tools: false,
    search: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
