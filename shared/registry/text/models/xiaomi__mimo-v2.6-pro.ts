import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "xiaomi/mimo-v2.6-pro";

export default {
    supportedParameters: CHAT_PARAMETERS.mimo,
    aliases: [],
    provider: "novita",
    publisher: "Xiaomi",
    category: "text",
    addedDate: new Date("2026-09-22").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // Novita direct (2026-10-10): base rates without OpenRouter's 5.5% fee.
    cost: {
        promptTextTokens: perMillion(0.435),
        promptCachedTokens: perMillion(0.0036),
        // Novita reports image tokens as prompt tokens; bill them at the input rate.
        promptImageTokens: perMillion(0.435),
        completionTextTokens: perMillion(0.87),
    },
    title: "MiMo V2.6 Pro",
    description:
        "Flagship long-context reasoning and coding at higher capability",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
