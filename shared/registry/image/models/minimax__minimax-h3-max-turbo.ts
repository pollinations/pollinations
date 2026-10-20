import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "minimax/minimax-h3-max-turbo";

export default {
    aliases: [],
    provider: "fal",
    publisher: "MiniMax",
    category: "video",
    addedDate: new Date("2026-09-04").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // fal reports resolution-weighted units for the selected resolution.
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
                id: "fal.minimax_h3_max_turbo.provider_units.v1",
                description: "Provider cost including the selected resolution",
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
    title: "MiniMax H3 Max Turbo",
    description:
        "Fast 5–15 second video with synchronized audio and first/last-frame control at 480p, 768p, or 1080p",
    inputModalities: ["text", "image"],
    outputModalities: ["video", "audio"],
    videoCapabilities: ["start_frame", "end_frame", "audio_output"],
    maxReferenceImages: 2,
    minDuration: 5,
    maxDuration: 15,
    defaultDuration: 5,
    allowedDurations: [5, 10, 15],
} satisfies ModelDefinition;
