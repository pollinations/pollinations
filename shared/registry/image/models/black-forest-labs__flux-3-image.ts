import { defineCostVariants, matchResolution } from "../../cost-variants";
import { FLUX3_LAUNCH_DISCOUNT_END } from "../../image.ts";
import type { ModelDefinition } from "../../registry";

export const id = "black-forest-labs/flux-3-image";

export default {
    aliases: [],
    provider: "openrouter",
    publisher: "Black Forest Labs",
    category: "image",
    addedDate: new Date("2026-10-02").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // https://bfl.ai/pricing: 50% launch discount ends Oct 8 at 15:00 UTC.
    // Read rates at request time so warm workers also quote the cutover.
    // Settlement always uses OpenRouter's reported cost plus its 5.5% fee.
    cost: {
        get completionImageTokens() {
            return (
                (Date.now() < FLUX3_LAUNCH_DISCOUNT_END ? 0.024 : 0.048) * 1.055
            );
        },
    },
    ...defineCostVariants(
        {
            "2k": {
                get completionImageTokens() {
                    return (
                        (Date.now() < FLUX3_LAUNCH_DISCOUNT_END ? 0.05 : 0.1) *
                        1.055
                    );
                },
            },
        },
        matchResolution("2k"),
        {
            "2k": {
                label: "2K",
                description:
                    "Applies when the requested image resolution is 2K.",
            },
        },
        "1K",
        [
            {
                "key": "resolution",
                "label": "Resolution",
                "values": {
                    "": "1K",
                    "2k": "2K",
                },
            },
        ],
    ),
    resolutions: ["1k", "2k"],
    title: "FLUX.3 Image",
    description:
        "Flagship text-to-image and multi-reference editing at 1K or 2K with up to ten references",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 10,
} satisfies ModelDefinition;
