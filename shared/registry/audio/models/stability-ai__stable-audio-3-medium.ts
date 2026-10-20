import type { ModelDefinition } from "../../registry";
export const id = "stability-ai/stable-audio-3-medium";

export default {
    aliases: [
        "stable-audio",
        "stability-audio",
        "stable-audio-2.5",
        "stable-audio-3-medium",
        "fal-ai/stable-audio-3/medium",
    ],
    provider: "fal",
    publisher: "Stability AI",
    category: "audio",
    addedDate: new Date("2026-06-23").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    flatRate: true,
    cost: {
        // Flat per-generation fee (fal model pages 2026-06-23):
        //   text-to-audio  $0.0376  (output audio)
        //   audio-to-audio $0.0417  (+$0.0041 for the reference-clip input)
        // The handler bills whole units: 1 completion audio unit always, plus
        // 1 prompt audio unit for audio-to-audio (see gen audio.ts).
        promptAudioTokens: 0.0417 - 0.0376,
        completionAudioTokens: 0.0376,
    },
    title: "Stable Audio 3 Medium",
    description: "Long-form stereo music and soundscapes in studio quality",
    inputModalities: ["text", "audio"],
    outputModalities: ["audio"],
    minDuration: 1,
    maxDuration: 380,
} satisfies ModelDefinition;
