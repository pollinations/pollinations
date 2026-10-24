import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "microsoft/mai-voice-2.1-flash:vercel";
export const parent = "microsoft/mai-voice-2.1-flash";
export const order = 0;

export default {
    provider: "vercel",
    cost: { completionAudioTokens: 15 / 1_000_000 },
} satisfies FallbackDefinition;
