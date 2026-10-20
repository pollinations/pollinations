import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "x-ai/grok-imagine-video-1.5-lite";

export default {
    aliases: [],
    provider: "xai",
    publisher: "xAI",
    category: "video",
    addedDate: new Date("2026-10-06").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        // xAI direct API rates (docs.x.ai, 2026-10-06).
        promptImageTokens: 0.01, // per start-frame image
        completionVideoSeconds: 0.03, // per sec at 720p
    },
    ...defineCostVariants(
        {
            "480p": {
                completionVideoSeconds: 0.02,
            },
            "1080p": {
                completionVideoSeconds: 0.14,
            },
        },
        matchResolution("480p", "1080p"),
        {
            "480p": {
                label: "480p",
                description:
                    "Applies when the requested video resolution is 480p.",
            },
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
                    "480p": "480p",
                    "1080p": "1080p",
                },
            },
        ],
    ),
    resolutions: ["720p", "480p", "1080p"],
    title: "Grok Imagine Video 1.5 Lite",
    description:
        "Faster, lower-cost video from text or a start image at 480p, 720p, or 1080p",
    inputModalities: ["text", "image"],
    outputModalities: ["video"],
    videoCapabilities: ["start_frame"],
    maxReferenceImages: 1, // Video keyframe slots: start only.
    minDuration: 1,
    maxDuration: 15,
    defaultDuration: 5,
} satisfies ModelDefinition;
