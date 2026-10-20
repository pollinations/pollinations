import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "bytedance/seedance-1-pro-fast";

export default {
    aliases: ["seedance-pro"],
    provider: "replicate",
    publisher: "ByteDance",
    category: "video",
    addedDate: new Date("2025-12-04").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // Replicate bytedance/seedance-1-pro-fast is per-second tiered by
    // resolution (480p $0.015, 720p $0.025, 1080p $0.06).
    cost: {
        completionVideoSeconds: 0.025, // per sec at 720p
    },
    ...defineCostVariants(
        {
            "480p": {
                completionVideoSeconds: 0.015,
            },
            "1080p": {
                completionVideoSeconds: 0.06,
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
    title: "Seedance 1.0 Pro Fast",
    description: "Video from text or a start image at 480p, 720p, or 1080p",
    inputModalities: ["text", "image"],
    outputModalities: ["video"],
    videoCapabilities: ["start_frame"],
    maxReferenceImages: 1, // Video keyframe slots: start only.
    minDuration: 2,
    maxDuration: 10,
    defaultDuration: 5,
} satisfies ModelDefinition;
