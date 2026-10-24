import type { ModelDefinition } from "../../registry";
export const id = "kwaivgi/kling-v3.0-std";

export default {
    aliases: [],
    provider: "fal",
    publisher: "Kuaishou",
    category: "video",
    addedDate: new Date("2026-09-19").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // fal.ai kling-video/v3/standard direct published rates (2026-09-22).
    // No OpenRouter credit fee: fal is the only route (#15176 review
    // found OpenRouter applies a 5-second billing minimum and returns
    // 1080p for a requested 720p, so it is not a compatible fallback).
    // Base is $0.084/s silent; audio adds $0.042/s ($0.126/s with audio).
    cost: {
        completionVideoSeconds: 0.084, // per sec at 720p
        completionAudioSeconds: 0.042, // per sec when audio is enabled
    },
    resolutions: ["720p"],
    title: "Kling 3.0 Standard",
    description:
        "Cinematic video with optional synchronized audio from text or start and end frames at 720p",
    inputModalities: ["text", "image"],
    outputModalities: ["video", "audio"],
    videoCapabilities: ["start_frame", "end_frame", "audio_output"],
    maxReferenceImages: 2, // Video keyframe slots: start + end.
    minDuration: 3,
    maxDuration: 15,
    defaultDuration: 5,
} satisfies ModelDefinition;
