import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "google/gemini-omni-1.1-flash";

export default {
    aliases: [],
    provider: "google",
    publisher: "Google",
    category: "video",
    addedDate: new Date("2026-08-28").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // Vertex AI pricing verified 2026-08-28:
    // https://cloud.google.com/vertex-ai/generative-ai/pricing
    cost: {
        promptTextTokens: perMillion(1.5),
        promptImageTokens: perMillion(1.5),
        completionTextTokens: perMillion(9),
        completionVideoTokens: perMillion(17.5),
    },
    resolutions: ["720p", "360p", "1080p", "4k"],
    title: "Gemini Omni 1.1 Flash",
    description:
        "Cinematic video from text or keyframes with synchronized audio at up to 4K",
    inputModalities: ["text", "image"],
    outputModalities: ["video"],
    videoCapabilities: ["start_frame", "end_frame", "audio_output"],
    maxReferenceImages: 2,
    minDuration: 3,
    maxDuration: 10,
    defaultDuration: 5,
} satisfies ModelDefinition;
