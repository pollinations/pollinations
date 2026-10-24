import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "tencent/hy4-preview";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterHy4Preview,
    aliases: [],
    provider: "openrouter",
    publisher: "Tencent",
    category: "text",
    addedDate: new Date("2026-09-12").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Tencent (fp8) route rates (2026-09-12), including
        // the mandatory 5.5% OpenRouter credit fee (#14895, merged
        // 2026-09-15, after this branch was created).
        promptTextTokens: perMillion(0.834) * 1.055,
        promptCachedTokens: perMillion(0.042) * 1.055,
        completionTextTokens: perMillion(2.501) * 1.055,
    },
    title: "Hy4 Preview",
    description:
        "Mixture-of-experts model for coding agents and complex tool-use workflows",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
