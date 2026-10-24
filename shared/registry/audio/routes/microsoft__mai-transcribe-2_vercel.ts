import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "microsoft/mai-transcribe-2:vercel";
export const parent = "microsoft/mai-transcribe-2";
export const order = 0;

export default {
    provider: "vercel",
    cost: { promptAudioSeconds: 0.1 / 3600 },
} satisfies FallbackDefinition;
