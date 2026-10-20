import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "deepseek/deepseek-v4.1-flash:fireworks";
export const parent = "deepseek/deepseek-v4.1-flash";

export default {
    supportedParameters: CHAT_PARAMETERS.fireworksReasoning,
    provider: "fireworks",
    addedDate: new Date("2026-10-12").getTime(),
    cost: {
        // Fireworks Standard rates (2026-10-12).
        promptTextTokens: perMillion(0.3),
        promptCachedTokens: perMillion(0.006),
        completionTextTokens: perMillion(1.2),
    },
} satisfies FallbackDefinition;
