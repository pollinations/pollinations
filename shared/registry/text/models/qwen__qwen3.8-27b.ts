import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.8-27b";

export default {
    supportedParameters: CHAT_PARAMETERS.qwen38,
    aliases: ["qwen3.8-27b"],
    provider: "openrouter",
    publisher: "Qwen",
    category: "text",
    addedDate: new Date("2026-08-18").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Chutes FP8 route rates (2026-10-13), including the
        // account's 5.5% credit-purchase fee. OpenRouter publishes one
        // prompt rate and no separate image/video rates.
        promptTextTokens: perMillion(0.039) * 1.055,
        promptCachedTokens: perMillion(0.0039) * 1.055,
        promptImageTokens: perMillion(0.039) * 1.055,
        promptVideoTokens: perMillion(0.039) * 1.055,
        completionTextTokens: perMillion(1.25) * 1.055,
    },
    title: "Qwen3.8 27B",
    description:
        "Dense multimodal reasoning for coding, tool use, and structured generation",
    inputModalities: ["text", "image", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    maxReferenceVideos: 10,
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
