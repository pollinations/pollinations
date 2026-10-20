import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "microsoft/mai-image-2.6-flash";

export default {
    aliases: ["microsoft/mai-image-2.5-flash"],
    provider: "azure",
    publisher: "Microsoft",
    category: "image",
    addedDate: new Date("2026-09-22").getTime(),
    // Provider retires this route on 2027-01-09.
    paidOnly: false,
    priceMultiplier: 0.75,
    perUserRpm: 12,
    // Azure Global Standard meters, verified 2026-09-22 in both regions.
    cost: {
        promptTextTokens: perMillion(1.75),
        promptImageTokens: perMillion(2.5),
        completionImageTokens: perMillion(19),
    },
    title: "MAI Image 2.6 Flash",
    description:
        "Photorealistic generation and editing with up to five references and accurate text rendering",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 5, // Azure MAI edits accept 1 to 5 `image` parts.
} satisfies ModelDefinition;
