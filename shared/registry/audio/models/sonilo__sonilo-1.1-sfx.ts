export const id = "sonilo/sonilo-1.1-sfx";

export default {
    aliases: [],
    provider: "fal",
    publisher: "Sonilo",
    category: "audio",
    paidOnly: true,
    addedDate: new Date("2026-10-15").getTime(),
    priceMultiplier: 1,
    cost: {
        // fal's price per second of video. Charges use fal's reported
        // seconds at its live endpoint price.
        completionAudioSeconds: 0.009,
    },
    title: "Sonilo 1.1 SFX",
    description: "Sound effects timed to a video, as a separate audio track",
    inputModalities: ["text", "video"],
    outputModalities: ["audio"],
} satisfies ModelDefinition;
