import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "nex-agi/nex-n2.5-pro";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterNexPro,
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
        promptTextTokens: perMillion(0.075) * 1.055,
        promptCachedTokens: perMillion(0.015) * 1.055,
        completionTextTokens: perMillion(0.25) * 1.055,
    },
    title: "Nex N2.5 Pro",
    description:
        "Agentic coding model with a visual feedback loop for multi-file changes, tool use and image input",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
