import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "meta/muse-wonder-1.0:vercel";
export const parent = "meta/muse-wonder-1.0";

export default {
    supportedParameters: CHAT_PARAMETERS.vercelMuseWonder,
    provider: "vercel",
    addedDate: new Date("2026-10-12").getTime(),
    // Vercel AI Gateway catalog rates (2026-10-12): base rates with no
    // OpenRouter fee. Same Meta-hosted model; covers OpenRouter
    // failures, not Meta outages.
    cost: {
        promptTextTokens: perMillion(4),
        promptCachedTokens: perMillion(0.2),
        promptImageTokens: perMillion(4),
        completionTextTokens: perMillion(20),
    },
} satisfies FallbackDefinition;
