import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "deepseek/deepseek-v4-flash-vision-exp";

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    aliases: [],
    provider: "deepinfra",
    publisher: "DeepSeek",
    category: "text",
    addedDate: new Date("2026-09-02").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // DeepInfra rates (2026-09-23): list $0.44/$1.32 with an open-ended
    // 51% discount.
    cost: {
        promptTextTokens: perMillion(0.2156),
        promptCachedTokens: perMillion(0.0069),
        promptImageTokens: perMillion(0.2156),
        completionTextTokens: perMillion(0.6468),
    },
    title: "DeepSeek V4 Flash Vision Exp",
    description:
        "Low-cost multimodal reasoning for coding, agents and visual analysis",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 30,
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
