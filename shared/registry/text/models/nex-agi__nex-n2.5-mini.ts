import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "nex-agi/nex-n2.5-mini";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterNexMini,
    aliases: [],
    provider: "openrouter",
    publisher: "Nex AGI",
    category: "text",
    addedDate: new Date("2026-10-03").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Nex AGI endpoint rates (2026-10-03), including the
        // mandatory 5.5% OpenRouter credit fee.
        promptTextTokens: perMillion(0.025) * 1.055,
        promptCachedTokens: perMillion(0.0025) * 1.055,
        completionTextTokens: perMillion(0.1) * 1.055,
    },
    title: "Nex N2.5 Mini",
    description:
        "Compact agentic coding model with image input and switchable reasoning",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: false,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
