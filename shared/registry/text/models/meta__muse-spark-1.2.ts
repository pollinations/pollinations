import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "meta/muse-spark-1.2";

export default {
    supportedParameters: CHAT_PARAMETERS.museSpark,
    aliases: [
        "muse-spark-1.1",
        "muse-spark",
        "spark",
        "spark-1.1",
        "muse-spark-1.2",
    ],
    provider: "vercel",
    publisher: "Meta",
    category: "text",
    addedDate: new Date("2026-08-14").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        promptTextTokens: perMillion(1.25),
        promptCachedTokens: perMillion(0.15),
        completionTextTokens: perMillion(4.25),
    },
    title: "Muse Spark 1.2",
    description: "Agentic coding and tool-use model with 1M context",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
