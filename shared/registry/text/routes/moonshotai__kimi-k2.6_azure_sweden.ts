import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "moonshotai/kimi-k2.6:azure:sweden";
export const parent = "moonshotai/kimi-k2.6";
export const order = 0;

export default {
    provider: "azure",
    addedDate: new Date("2026-09-23").getTime(),
    // Provider retires this route on 2027-04-16.
} satisfies FallbackDefinition;
