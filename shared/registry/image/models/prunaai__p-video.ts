import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

// Pruna p-video is one Replicate model priced per second by resolution:
// 720p $0.02/s and 1080p $0.04/s in standard mode.

export const id = "prunaai/p-video";

export default {
    aliases: [
        "pruna-video",
        "p-video-720p",
        "p-video-1080p",
        "pruna-video-1080p",
        "p-video",
    ],
    provider: "replicate",
    publisher: "Pruna",
    category: "video",
    addedDate: new Date("2026-03-14").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionVideoSeconds: 0.02, // Replicate 720p per sec
    },
    ...defineCostVariants(
        {
            "1080p": {
                completionVideoSeconds: 0.04,
            },
        },
        matchResolution("1080p"),
        {
            "1080p": {
                label: "1080p",
                description:
                    "Applies when the requested video resolution is 1080p.",
            },
        },
        "720p",
        [
            {
                "key": "resolution",
                "label": "Resolution",
                "values": {
                    "": "720p",
                    "1080p": "1080p",
                },
            },
        ],
    ),
    resolutions: ["720p", "1080p"],
    title: "Pruna p-video",
    description: "Affordable video from text or an image at 720p or 1080p",
    inputModalities: ["text", "image"],
    outputModalities: ["video"],
    videoCapabilities: ["start_frame"],
    maxReferenceImages: 1, // Video keyframe slots: start only.
    minDuration: 1,
    maxDuration: 10,
    defaultDuration: 5,
} satisfies ModelDefinition;
