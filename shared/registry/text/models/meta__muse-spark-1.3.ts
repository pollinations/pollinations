import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "meta/muse-spark-1.3";

export default {
    supportedParameters: CHAT_PARAMETERS.museSpark,
    aliases: [],
    provider: "vercel",
    publisher: "Meta",
    category: "text",
    addedDate: new Date("2026-10-23").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Vercel AI Gateway Meta route, verified 2026-10-23.
        promptTextTokens: perMillion(1.25),
        promptCachedTokens: perMillion(0.15),
        completionTextTokens: perMillion(4.25),
    },
    title: "Muse Spark 1.3",
    description:
        "Long-horizon multimodal reasoning for coding, agents and tool-driven workflows",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
