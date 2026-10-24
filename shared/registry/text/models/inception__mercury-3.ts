import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "inception/mercury-3";

export default {
    supportedParameters: CHAT_PARAMETERS.mercury25,
    aliases: [],
    provider: "openrouter",
    publisher: "Inception",
    category: "text",
    addedDate: new Date("2026-10-19").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // OpenRouter's Inception route launch rates (50% off, checked
    // 2026-10-23), including the account's 5.5% credit-purchase fee. List
    // is $0.20 / $0.02 cached / $0.70 per M; raise these when the launch
    // offer ends (no end date published).
    cost: {
        promptTextTokens: perMillion(0.1) * 1.055,
        promptCachedTokens: perMillion(0.01) * 1.055,
        completionTextTokens: perMillion(0.35) * 1.055,
    },
    title: "Mercury 3",
    description:
        "Diffusion reasoning for agentic workflows and real-time voice and search",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
