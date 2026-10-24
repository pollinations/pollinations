import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "cohere/embed-v4.0:azure:sweden";
export const parent = "cohere/embed-v4.0";
export const order = 0;

export default {
    provider: "azure",
} satisfies FallbackDefinition;
