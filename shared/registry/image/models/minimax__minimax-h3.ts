import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "minimax/minimax-h3";

export default {
    aliases: ["minimax-h3"],
    provider: "fal",
    publisher: "MiniMax",
    category: "video",
    addedDate: new Date("2026-08-14").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionVideoSeconds: 0.05, // fal, 480p per second, verified 2026-08-14.
    },
    ...defineCostVariants(
        {
            "768p": { completionVideoSeconds: 0.06 },
            "2k": { completionVideoSeconds: 0.13 },
        },
        matchResolution("768p", "2k"),
        {
            "768p": {
                label: "768p",
                description:
                    "Applies when the requested video resolution is 768p.",
            },
            "2k": {
                label: "2K",
                description:
                    "Applies when the requested video resolution is 2K.",
            },
        },
        "480p",
        [
            {
                "key": "resolution",
                "label": "Resolution",
                "values": {
                    "": "480p",
                    "768p": "768p",
                    "2k": "2K",
                },
            },
        ],
    ),
    resolutions: ["480p", "768p", "2k"],
    title: "MiniMax H3",
    description:
        "Five-second text-to-video clips with synchronized stereo audio at 480p, 768p, or 2K",
    inputModalities: ["text"],
    outputModalities: ["video", "audio"],
    videoCapabilities: ["audio_output"],
    minDuration: 5,
    maxDuration: 5,
    defaultDuration: 5,
} satisfies ModelDefinition;
