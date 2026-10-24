import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "inclusionai/ling-3.0-flash-vl";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterLing,
    aliases: [],
    provider: "openrouter",
    publisher: "inclusionAI",
    category: "text",
    addedDate: new Date("2026-09-19").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter DeepInfra fp16 route rates (2026-09-19), including
        // the mandatory 5.5% OpenRouter credit fee. OpenRouter publishes
        // one prompt rate and no separate image/video rates: images and
        // video parts are tokenized into the prompt total.
        promptTextTokens: perMillion(0.06) * 1.055,
        promptCachedTokens: perMillion(0.012) * 1.055,
        promptImageTokens: perMillion(0.06) * 1.055,
        promptVideoTokens: perMillion(0.06) * 1.055,
        completionTextTokens: perMillion(0.18) * 1.055,
    },
    title: "Ling 3.0 Flash VL",
    description:
        "Low-cost multimodal MoE with image and video understanding and tool calling",
    inputModalities: ["text", "image", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    maxReferenceVideos: 10,
    tools: true,
    contextLength: 131072,
    isSpecialized: false,
} satisfies ModelDefinition;
