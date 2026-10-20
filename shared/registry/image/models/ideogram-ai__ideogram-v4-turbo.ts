import type { ModelDefinition } from "../../registry";
// Ideogram 4.0 (turbo/balanced/quality) via Replicate. These are official
// Replicate models (is_official=true) → billed a FLAT price per output
// image set by the publisher, NOT per-second of GPU time. The price is
// therefore independent of the resolution preset the handler picks, and all
// v4 presets sit in a single 3.4–4.2 MP band (no 1K/2K/4K tier split). So a
// flat per-image cost is correct regardless of aspect ratio / resolution.

export const id = "ideogram-ai/ideogram-v4-turbo";

export default {
    aliases: ["ideogram-v4-turbo"],
    provider: "replicate",
    publisher: "Ideogram",
    category: "image",
    addedDate: new Date("2026-06-15").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionImageTokens: 0.03, // flat per image — ideogram-ai/ideogram-v4-turbo
    },
    title: "Ideogram 4.0 Turbo",
    description: "Fast images with crisp, accurate text and typography",
    inputModalities: ["text"],
    outputModalities: ["image"],
} satisfies ModelDefinition;
