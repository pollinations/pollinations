import { defineCostVariants } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "bytedance/seedance-2.5";

export default {
    aliases: ["seedance-2.5"],
    provider: "replicate",
    publisher: "ByteDance",
    category: "video",
    addedDate: new Date("2026-08-09").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionVideoSeconds: 0.1028, // per sec at 480p
    },
    ...defineCostVariants(
        {
            "720p": {
                completionVideoSeconds: 0.2312,
            },
            video_in_480p: {
                completionVideoSeconds: 0.4304,
            },
            video_in_720p: {
                completionVideoSeconds: 0.9676,
            },
        },
        ({ input }) => {
            if (!input?.hasReferenceVideo) {
                return input?.resolution === "720p" ? "720p" : undefined;
            }
            return input.resolution === "720p"
                ? "video_in_720p"
                : "video_in_480p";
        },
        {
            "720p": {
                label: "720p",
                description:
                    "Applies when the requested video resolution is 720p.",
            },
            video_in_480p: {
                label: "480p with reference video",
                description:
                    "Applies when the request includes a reference video input at 480p.",
            },
            video_in_720p: {
                label: "720p with reference video",
                description:
                    "Applies when the request includes a reference video input at 720p.",
            },
        },
        "480p",
        [
            {
                "key": "resolution",
                "label": "Resolution",
                "values": {
                    "": "480p",
                    "720p": "720p",
                    "video_in_480p": "480p",
                    "video_in_720p": "720p",
                },
            },
            {
                "key": "reference_video",
                "label": "Video input",
                "values": {
                    "": "No",
                    "720p": "No",
                    "video_in_480p": "Yes",
                    "video_in_720p": "Yes",
                },
            },
        ],
    ),
    resolutions: ["480p", "720p"],
    title: "Seedance 2.5",
    description:
        "Four-second video with synchronized audio and reference media at 480p or 720p",
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
    maxDuration: 4,
    defaultDuration: 4,
} satisfies ModelDefinition;
