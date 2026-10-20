import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "stepfun/step-3.5-flash";

export default {
    supportedParameters: CHAT_PARAMETERS.step35,
    aliases: ["stepfun-3.5-flash", "step-flash-3.5", "step-3.5-flash"],
    provider: "openrouter",
    publisher: "StepFun",
    category: "text",
    addedDate: new Date("2026-05-29").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter stepfun/step-3.5-flash posted rates (2026-07-10):
        // prompt $0.10/M, completion $0.30/M
        promptTextTokens: perMillion(0.1) * 1.055,
        completionTextTokens: perMillion(0.3) * 1.055,
    },
    title: "StepFun Step 3.5 Flash",
    description: "Fast, low-cost text reasoning for everyday tasks",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
