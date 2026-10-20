import type { FallbackDefinition } from "../../merge-fallbacks";
export const id = "x-ai/grok-4.6:azure:sweden";
export const parent = "x-ai/grok-4.6";
export const order = 0;

export default {
    provider: "azure",
    addedDate: new Date("2026-09-06").getTime(),
    // Provider retires this route on 2027-08-24.
} satisfies FallbackDefinition;
