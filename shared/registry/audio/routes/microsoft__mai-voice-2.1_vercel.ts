import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "microsoft/mai-voice-2.1:vercel";
export const parent = "microsoft/mai-voice-2.1";
export const order = 0;

export default {
    provider: "vercel",
    cost: { completionAudioTokens: 22 / 1_000_000 },
} satisfies FallbackDefinition;
