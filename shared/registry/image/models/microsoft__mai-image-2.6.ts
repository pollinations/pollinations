import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "microsoft/mai-image-2.6";

export default {
    aliases: [],
    provider: "azure",
    publisher: "Microsoft",
    category: "image",
    addedDate: new Date("2026-09-23").getTime(),
    // Provider retires this route on 2027-01-09.
    paidOnly: false,
    priceMultiplier: 0.75,
    perUserRpm: 12,
    // Azure Global Standard meters, verified 2026-09-23.
    cost: {
        promptTextTokens: perMillion(5),
        promptImageTokens: perMillion(8),
        completionImageTokens: perMillion(38),
    },
    title: "MAI Image 2.6",
    description:
        "Detailed photorealistic generation and editing with up to five references and strong instruction following",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 5, // Azure MAI edits accept 1 to 5 `image` parts.
} satisfies ModelDefinition;
