import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "minimax/minimax-h3-max";

export default {
    aliases: [],
    provider: "fal",
    publisher: "MiniMax",
    category: "video",
    addedDate: new Date("2026-09-24").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // fal reports resolution-weighted units including reference-media charges.
    // Keep output duration separate; charge the current endpoint price below.
    cost: { completionVideoSeconds: 0 },
    // Retain resolution selection for the catalog and analytics. All
    // resolutions are billed by provider units, not output duration.
    ...defineCostVariants(
        {
            "768p": { completionVideoSeconds: 0 },
            "1080p": { completionVideoSeconds: 0 },
        },
        matchResolution("768p", "1080p"),
        {
            "768p": {
                label: "768p",
                description: "768p video billed from provider-reported units.",
            },
            "1080p": {
                label: "1080p",
                description: "1080p video billed from provider-reported units.",
            },
        },
        "480p",
        [
            {
                key: "resolution",
                label: "Resolution",
                values: { "": "480p", "768p": "768p", "1080p": "1080p" },
            },
        ],
    ),
    billing: {
        adjustments: [
            {
                id: "fal.minimax_h3_max.provider_units.v1",
                description:
                    "Provider cost including resolution and reference media",
                kind: "video",
                unit: "provider unit",
                unitCost: 1,
                publicPricing: {
                    label: "Provider cost",
                    quantity: 1,
                    unit: "USD",
                },
                countUnits: (_output, input) =>
                    input?.providerBilling?.units ?? 0,
                resolveUnitCost: (_output, _model, input) =>
                    input?.providerBilling?.unitCost ?? 0,
            },
        ],
    },
    resolutions: ["480p", "768p", "1080p"],
    title: "MiniMax H3 Max",
    description:
        "High-quality 5–15 second video from text, start/end frames, or reference media with synchronized audio at 480p, 768p, or 1080p",
    inputModalities: ["text", "image", "video", "audio"],
    outputModalities: ["video", "audio"],
    videoCapabilities: [
        "start_frame",
        "end_frame",
        "audio_output",
        "reference_images",
        "reference_videos",
        "reference_audios",
    ],
    maxReferenceImages: 2,
    minDuration: 5,
    maxDuration: 15,
    defaultDuration: 5,
    allowedDurations: [5, 10, 15],
} satisfies ModelDefinition;
