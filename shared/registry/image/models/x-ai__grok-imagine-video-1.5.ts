import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "x-ai/grok-imagine-video-1.5";

export default {
    aliases: ["grok-imagine-video-1.5"],
    provider: "openrouter",
    publisher: "xAI",
    category: "video",
    addedDate: new Date("2026-08-03").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        promptImageTokens: 0.01 * 1.055, // per start-frame image
        completionVideoSeconds: 0.14 * 1.055, // per sec at 720p
    },
    ...defineCostVariants(
        {
            "480p": {
                completionVideoSeconds: 0.08 * 1.055,
            },
            "1080p": {
                completionVideoSeconds: 0.25 * 1.055,
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
    title: "Grok Imagine Video 1.5",
    description:
        "Video from text or a start image with synchronized audio at 480p, 720p, or 1080p",
    inputModalities: ["text", "image"],
    outputModalities: ["video", "audio"],
    videoCapabilities: ["start_frame", "audio_output"],
    maxReferenceImages: 1, // Video keyframe slots: start only.
    minDuration: 1,
    maxDuration: 15,
    defaultDuration: 5,
} satisfies ModelDefinition;
