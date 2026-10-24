import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "black-forest-labs/flux.1-schnell:deepinfra";
export const parent = "black-forest-labs/flux.1-schnell";
export const order = 0;

export default {
    provider: "deepinfra",
    addedDate: new Date("2026-09-01").getTime(),
    cost: { completionImageTokens: 0.0005 },
} satisfies FallbackDefinition;
