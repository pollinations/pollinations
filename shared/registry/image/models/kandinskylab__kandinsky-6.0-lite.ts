import { defineCostVariants } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "kandinskylab/kandinsky-6.0-lite";

export default {
    aliases: [],
    provider: "fal",
    publisher: "Kandinsky Lab",
    category: "video",
    addedDate: new Date("2026-10-11").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // fal.ai list prices for one 5-second 480p video at the default 10
    // steps. Charges use fal's reported units at its live endpoint price.
    cost: {
        completionVideoSeconds: 0.032, // $0.16 per video
    },
    ...defineCostVariants(
        {
            start_image: {
                completionVideoSeconds: 0.034, // $0.17 per video
            },
        },
        ({ input }) => (input?.hasImage ? "start_image" : undefined),
        {
            start_image: {
                label: "From a start image",
                description: "Applies when the request includes a start image.",
            },
        },
        "From text",
        [
            {
                key: "input",
                label: "Input",
                values: { "": "Text", start_image: "Image" },
            },
        ],
    ),
    resolutions: ["480p"],
    title: "Kandinsky 6.0 Lite",
    description:
        "Fast 5-second video from text or start image with synchronized audio at 480p",
    inputModalities: ["text", "image"],
    outputModalities: ["video", "audio"],
    videoCapabilities: ["start_frame", "audio_output"],
    maxReferenceImages: 1,
    minDuration: 5,
    maxDuration: 5,
    defaultDuration: 5,
} satisfies ModelDefinition;
