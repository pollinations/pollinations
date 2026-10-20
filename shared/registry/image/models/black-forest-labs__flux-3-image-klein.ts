import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "black-forest-labs/flux-3-image-klein";

export default {
    aliases: [],
    provider: "fal",
    publisher: "Black Forest Labs",
    category: "image",
    addedDate: new Date("2026-10-15").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // fal pricing (2026-10-18): $0.009 per billed unit. fal bills BFL's
    // per-image tiers in these units (1K = 1, 4K = 4), so price = fal's
    // charge. Usage counts millionths of a unit.
    cost: {
        completionImageTokens: perMillion(0.009),
    },
    priceUnits: {
        completionImageTokens: { unit: "megapixel", quantity: 1_000_000 },
    },
    title: "FLUX.3 Image Klein",
    description:
        "Distilled text-to-image and multi-reference editing up to 4K with up to ten references",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 10,
} satisfies ModelDefinition;
