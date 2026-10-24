import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "openai/gpt-image-1-mini:openai";
export const parent = "openai/gpt-image-1-mini";
export const order = 0;

export default {
    provider: "openai",
    addedDate: new Date("2026-09-03").getTime(),
    // OpenAI shutdown_date.
    // Provider retires this route on 2026-12-01.
} satisfies FallbackDefinition;
