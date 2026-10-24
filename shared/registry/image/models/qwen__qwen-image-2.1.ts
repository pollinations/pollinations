import { defineCostVariants } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "qwen/qwen-image-2.1";

export default {
    aliases: [],
    provider: "fal",
    publisher: "Qwen",
    category: "image",
    addedDate: new Date("2026-09-20").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // Fal pricing: $0.02 per megapixel for text-to-image and $0.11/3 per
    // megapixel for edits. gen bills the megapixels fal reports. Fal
    // rounds output up to whole megapixels of 2^20 px, adds half a
    // megapixel per reference and doubles edits for the guidance_scale gen
    // sends (measured 2026-09-25). Usage counts millionths of a megapixel
    // (UInt32 usage columns), so perMillion(x) = $x per megapixel.
    cost: {
        completionImageTokens: perMillion(0.02),
    },
    priceUnits: {
        completionImageTokens: { unit: "megapixel", quantity: 1_000_000 },
    },
    ...defineCostVariants(
        {
            edit: {
                completionImageTokens: perMillion(0.11 / 3),
            },
        },
        ({ input }) => (input?.hasImage ? "edit" : undefined),
        {
            edit: {
                label: "Image editing",
                description:
                    "Applies when the request includes one or more input images.",
            },
        },
        "Image generation",
        [
            {
                "key": "operation",
                "label": "Operation",
                "values": {
                    "": "Generation",
                    "edit": "Editing",
                },
            },
        ],
    ),
    title: "Qwen Image 2.1",
    description:
        "Generates and edits images from prompts and up to ten references, with accurate text rendering",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 10,
} satisfies ModelDefinition;
