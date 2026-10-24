import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "heygen/heygen-video-1";

export default {
    aliases: [],
    provider: "openrouter",
    publisher: "HeyGen",
    category: "video",
    addedDate: new Date("2026-09-30").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // OpenRouter HeyGen endpoint, 50% launch discount through October 2026
    // (list $0.02/s at 480p, $0.03/s at 768p), verified 2026-10-01:
    // a 5s 480p clip billed 5 x $0.01. Includes the 5.5% OpenRouter
    // credit fee. Raise to list price when the discount ends.
    cost: {
        completionVideoSeconds: 0.01 * 1.055, // per sec at 480p
    },
    ...defineCostVariants(
        {
            "768p": { completionVideoSeconds: 0.015 * 1.055 },
        },
        matchResolution("768p"),
        {
            "768p": {
                label: "768p",
                description:
                    "Applies when the requested video resolution is 768p.",
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
                },
            },
        ],
    ),
    resolutions: ["480p", "768p"],
    title: "HeyGen Video 1",
    description:
        "Text and first-frame video with synchronized dialogue, ambience and effects at 480p or 768p",
    inputModalities: ["text", "image"],
    outputModalities: ["video", "audio"],
    videoCapabilities: ["start_frame", "audio_output"],
    maxReferenceImages: 1, // Video keyframe slots: start only.
    minDuration: 5,
    maxDuration: 15,
    defaultDuration: 5,
} satisfies ModelDefinition;
