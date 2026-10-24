import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "stepfun/step-3.7-flash";

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    aliases: [
        "stepfun-flash",
        "step-3.7-flash",
        "step-flash-3.7",
        "step-flash",
    ],
    provider: "novita",
    publisher: "StepFun",
    category: "text",
    addedDate: new Date("2026-05-29").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Novita stepfun/step-3.7-flash posted rates (2026-10-23):
        // prompt $0.20/M, completion $1.15/M, cache read $0.04/M
        promptTextTokens: perMillion(0.2),
        promptCachedTokens: perMillion(0.04),
        completionTextTokens: perMillion(1.15),
    },
    title: "StepFun Step 3.7 Flash",
    description: "Speedy reasoning over text and images for everyday questions",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    // Emits chain-of-thought (verified live); reasoning tokens are billed
    // within completion_tokens at the completionText rate.
    reasoning: true,
    contextLength: 256000,
    isSpecialized: false,
} satisfies ModelDefinition;
