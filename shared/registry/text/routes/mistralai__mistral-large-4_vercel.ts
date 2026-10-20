import type { FallbackDefinition } from "../../merge-fallbacks";
import { CHAT_PARAMETERS } from "../../text-parameters";

// Both routes use Mistral infrastructure; this covers gateway failures.

export const id = "mistralai/mistral-large-4:vercel";
export const parent = "mistralai/mistral-large-4";

export default {
    supportedParameters: CHAT_PARAMETERS.vercelMistralLarge4,
    provider: "vercel",
    addedDate: new Date("2026-10-06").getTime(),
} satisfies FallbackDefinition;
