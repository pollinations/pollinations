import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "prunaai/p-image-edit:replicate";
export const parent = "prunaai/p-image-edit";
export const order = 0;

export default {
    provider: "replicate",
    addedDate: new Date("2026-09-01").getTime(),
} satisfies FallbackDefinition;
