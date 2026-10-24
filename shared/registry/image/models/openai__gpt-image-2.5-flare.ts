import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "openai/gpt-image-2.5-flare";

export default {
    aliases: [],
    provider: "azure",
    publisher: "OpenAI",
    category: "image",
    addedDate: new Date("2026-09-08").getTime(),
    // Azure model catalog; the retirement schedule says 2027-09-09.
    // Provider retires this route on 2027-09-08.
    paidOnly: true,
    priceMultiplier: 0.75,
    cost: {
        // https://developers.openai.com/api/docs/models/gpt-image-2.5-flare
        promptTextTokens: perMillion(5),
        promptCachedTokens: perMillion(1.25),
        promptImageTokens: perMillion(8),
        completionImageTokens: perMillion(30),
    },
    title: "GPT Image 2.5 Flare",
    description:
        "Fast image generation and precise editing with reference images",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 16,
    supportsTransparency: true,
} satisfies ModelDefinition;
