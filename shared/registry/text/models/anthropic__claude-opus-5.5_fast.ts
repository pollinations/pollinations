import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-opus-5.5:fast";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeNoForcedTools,
    aliases: [],
    provider: "openrouter",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2026-10-10").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // Research preview: Anthropic's fast mode for Opus 5.5 at 2x standard
    // rates, served by OpenRouter's anthropic/fast endpoint (2026-10-10).
    // Costs include OpenRouter's 5.5% credit fee. Cache writes use the
    // 5-minute rate.
    cost: {
        promptTextTokens: perMillion(8) * 1.055,
        promptCachedTokens: perMillion(0.4) * 1.055,
        promptCacheWriteTokens: perMillion(10) * 1.055,
        completionTextTokens: perMillion(40) * 1.055,
    },
    title: "Claude Opus 5.5 Fast",
    description:
        "Higher output speed for interactive coding and agentic work, at premium pricing",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Same image limit as Opus 5.5.
    tools: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
