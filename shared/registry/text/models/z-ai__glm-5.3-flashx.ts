import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "z-ai/glm-5.3-flashx";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterGlmFlashx,
    aliases: [],
    provider: "openrouter",
    publisher: "Z.ai",
    category: "text",
    addedDate: new Date("2026-09-19").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Z.AI fp8 route rates (2026-10-12), including the
        // mandatory 5.5% OpenRouter credit fee. Image inputs are
        // tokenized into promptTextTokens; no separate usage is reported.
        promptTextTokens: perMillion(0.37) * 1.055,
        promptCachedTokens: perMillion(0.09) * 1.055,
        completionTextTokens: perMillion(1.25) * 1.055,
    },
    title: "Z.ai GLM-5.3 FlashX",
    description:
        "Faster million-token multimodal reasoning for agents and visual analysis",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
