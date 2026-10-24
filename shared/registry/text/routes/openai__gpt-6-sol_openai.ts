import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "openai/gpt-6-sol:openai";
export const parent = "openai/gpt-6-sol";
export const order = 0;

export default {
    provider: "openai",
} satisfies FallbackDefinition;
