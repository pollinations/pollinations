import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "openai/gpt-5.3-codex:azure:sweden";
export const parent = "openai/gpt-5.3-codex";
export const order = 0;

export default {
    provider: "azure",
    // Provider retires this route on 2027-08-24.
} satisfies FallbackDefinition;
