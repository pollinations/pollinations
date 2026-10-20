import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "stepfun/step-5-preview";

export default {
    supportedParameters: CHAT_PARAMETERS.step5,
    aliases: [],
    provider: "openrouter",
    publisher: "StepFun",
    category: "text",
    addedDate: new Date("2026-10-08").getTime(),
    paidOnly: true,
    priceMultiplier: 1, // Billed at cost, no margin.
    cost: {
        // OpenRouter stepfun/step-5-preview posted rates (2026-10-08):
        // prompt $1.00/M, cache read $0.05/M, completion $2.70/M, plus
        // OpenRouter's 5.5% credit fee.
        promptTextTokens: perMillion(1) * 1.055,
        promptCachedTokens: perMillion(0.05) * 1.055,
        completionTextTokens: perMillion(2.7) * 1.055,
    },
    title: "StepFun Step 5 Preview",
    description:
        "Agentic coding and long-document analysis with tool calling and image input",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    // Reasoning is mandatory, at low, medium or high effort (default medium).
    reasoning: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
