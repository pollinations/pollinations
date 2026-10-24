import type { ModelDefinition } from "../../registry";
export const id = "elevenlabs/music-v2";

export default {
    aliases: ["music", "elevenmusic"],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    addedDate: new Date("2026-02-08").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        // ElevenLabs Music v2: reference ingestion and generated output
        // are each billed at $0.15/minute.
        promptAudioSeconds: 0.0025,
        // Measured empirically (ffprobe-verified, 10s & 30s clips): 15.05 credits/sec.
        // Scale plan $0.166/1k credits => 15.05 * 0.166/1000 ≈ $0.0025/sec ($0.15/min).
        completionAudioSeconds: 0.0025,
    },
    title: "ElevenLabs Music",
    description: "Studio-grade music from a text prompt or reference track",
    inputModalities: ["text", "audio"],
    outputModalities: ["audio"],
    minDuration: 3,
    maxDuration: 300,
} satisfies ModelDefinition;
