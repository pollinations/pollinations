import type { FallbackDefinition } from "../../merge-fallbacks";
export const id = "anthropic/claude-sonnet-5.5:aws";
export const parent = "anthropic/claude-sonnet-5.5";
export const order = 0;

export default {
    provider: "aws",
    addedDate: new Date("2026-10-15").getTime(),
} satisfies FallbackDefinition;
