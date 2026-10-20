import { defineCostVariants } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "bytedance/seedance-2.0";

export default {
    aliases: ["seedance-2", "seedance-2.0"],
    provider: "replicate",
    publisher: "ByteDance",
    category: "video",
    addedDate: new Date("2026-05-07").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // non_video_in tier @ 720p; see Economics' replicate connector guide
    cost: {
        completionVideoSeconds: 0.18,
    },
    ...defineCostVariants(
        {
            video_in: {
                completionVideoSeconds: 0.22,
            },
        },
        ({ input }) => (input?.hasReferenceVideo ? "video_in" : undefined),
        {
            video_in: {
                label: "720p with reference video",
                description:
                    "Applies when the request includes a reference video input.",
            },
        },
        "720p",
        [
            {
                "key": "resolution",
                "label": "Resolution",
                "values": {
                    "": "720p",
                    "video_in": "720p",
                },
            },
            {
                "key": "reference_video",
                "label": "Video input",
                "values": {
                    "": "No",
                    "video_in": "Yes",
                },
            },
        ],
    ),
    resolutions: ["720p"],
    title: "Seedance 2.0",
    description:
        "720p video with natively synced sound, from text, images, or references",
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
    maxReferenceImages: 2, // Video keyframe slots: start + end.
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 5,
} satisfies ModelDefinition;
