import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "qwen/qwen3-embedding-8b:fireworks";
export const parent = "qwen/qwen3-embedding-8b";
export const order = 0;

export default {
    provider: "fireworks",
    cost: { promptTextTokens: perMillion(0.1) },
} satisfies FallbackDefinition;
