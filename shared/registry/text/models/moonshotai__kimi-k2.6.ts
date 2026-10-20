import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "moonshotai/kimi-k2.6";

export default {
    supportedParameters: CHAT_PARAMETERS.azureOpenReasoning,
    aliases: [
        "kimi-k2.6",
        "kimi-k2p6",
        "kimi-reasoning",
        "kimi-large",
        "kimi-thinking",
        "kimi",
    ],
    provider: "azure",
    publisher: "Moonshot AI",
    category: "text",
    addedDate: new Date("2026-04-22").getTime(),
    // Azure model catalog and retirement schedule (Preview).
    // Provider retires this route on 2027-04-16.
    priceMultiplier: 1,
    paidOnly: false,
    // Azure Global Standard "K2.6 Thinking" meters (2026-09-23).
    cost: {
        promptTextTokens: perMillion(0.95),
        promptCachedTokens: perMillion(0.16),
        promptImageTokens: perMillion(0.95),
        completionTextTokens: perMillion(4.0),
    },
    title: "Moonshot Kimi K2.6",
    description:
        "Agentic all-rounder that shows its chain-of-thought reasoning",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 30,
    tools: true,
    reasoning: true,
    contextLength: 262000,
    isSpecialized: false,
} satisfies ModelDefinition;
