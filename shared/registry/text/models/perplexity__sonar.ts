import { PERPLEXITY_WEB_SEARCH_BILLING } from "../../perplexity-billing";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "perplexity/sonar";

export default {
    supportedParameters: CHAT_PARAMETERS.sonar,
    aliases: [
        "sonar",
        "perplexity-high",
        "perplexity-deep",
        "sonar-deep",
        "perplexity-fast",
        // Sonar Pro and Reasoning Pro retired with the Sonar API on
        // 2026-09-27; the Agent API serves only Sonar.
        "perplexity/sonar-pro",
        "sonar-pro",
        "perplexity-pro",
        "perplexity",
        "perplexity/sonar-reasoning-pro",
        "sonar-reasoning",
        "sonar-reasoning-pro",
        "perplexity-reasoning",
    ],
    provider: "perplexity",
    publisher: "Perplexity",
    category: "text",
    addedDate: new Date("2025-11-04").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    billing: PERPLEXITY_WEB_SEARCH_BILLING,
    cost: {
        // Agent API rates (2026-09-23). Search results count as input.
        promptTextTokens: perMillion(0.25),
        promptCachedTokens: perMillion(0.0625),
        promptCacheWriteTokens: perMillion(0.25),
        completionTextTokens: perMillion(2.5),
    },
    title: "Perplexity Sonar Fast Search",
    description: "Quick web searches with cited answers; keeps it brief",
    // Sonar is text-only — verified empirically (image input is ignored,
    // no image tokens billed). Do not add "image".
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: false,
    // The Agent API answers json_object with an empty object; json_schema
    // works.
    supportsJsonMode: false,
    search: true,
    contextLength: 128000,
    isSpecialized: false,
} satisfies ModelDefinition;
