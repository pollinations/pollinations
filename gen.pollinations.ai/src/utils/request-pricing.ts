import type { Usage, UsageType } from "@shared/registry/registry.ts";
import {
    calculateUsagePriceCeiling,
    type UsageLimit,
} from "@shared/registry/usage-ceiling.ts";
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import type { GenerationModelEntry } from "../model-registry.ts";

// These handlers meter completionAudioTokens as characters/UTF-8 bytes.
// Other audio handlers use the same bucket for a generation or output tokens;
// its name alone is not enough to derive a request bound.
const CHARACTER_BILLED_SPEECH = new Set([
    "elevenlabs",
    "elevenflash",
    "eleven-multilingual-v2",
    "eleven-dialogue",
    "grok-tts",
    "fish-audio-s2.1-pro",
    "qwen-tts",
    "qwen-tts-instruct",
    "csm-1b",
    "kokoro",
]);

/** Quote already-validated generation input; null means no proven bound yet. */
export function quoteGenerationRequest(
    entry: GenerationModelEntry,
    body: Record<string, unknown>,
): { maximum: number; usage: Usage } | null {
    const { definition } = entry;
    if (entry.communityEndpoint || definition.search) return null;

    let usage: Usage;
    let limits: UsageLimit[];
    if (entry.eventType === "generate.text") {
        const chat = body as CreateChatCompletionRequest;
        const outputCap = chat.max_tokens;
        if (
            typeof outputCap !== "number" ||
            !Number.isSafeInteger(outputCap) ||
            outputCap <= 0 ||
            (chat.n !== undefined && chat.n !== 1) ||
            chat.messages.some(
                (message) => !message || Array.isArray(message.content),
            ) ||
            chat.web_search_options ||
            chat.modalities ||
            chat.audio ||
            chat.reasoning_effort ||
            (definition.cost.promptTextTokens ?? 0) <= 0 ||
            (definition.cost.completionTextTokens ?? 0) <= 0
        )
            return null;
        // A token cannot contain less than one UTF-8 byte. This bounds the
        // supported text prompt, including tools and message serialization.
        const promptBytes = new TextEncoder().encode(
            JSON.stringify(body),
        ).length;
        usage = {
            promptTextTokens: promptBytes,
            completionTextTokens: outputCap,
        };
        limits = [
            {
                units: ["promptTextTokens", "promptCachedTokens"],
                maximum: promptBytes,
            },
            { units: ["completionTextTokens"], maximum: outputCap },
        ];
    } else {
        // Media variant selection needs normalized request facts at settlement.
        if (definition.costVariants || definition.selectCostVariant)
            return null;
        if (definition.category === "image") {
            usage = { completionImageTokens: 1 };
        } else if (
            entry.eventType === "generate.audio" &&
            definition.outputModalities?.includes("audio") &&
            [entry.id, ...entry.aliases].some((id) =>
                CHARACTER_BILLED_SPEECH.has(id),
            )
        ) {
            if (
                body.reference_audio ||
                body.composition_plan ||
                body.conditioning_ref
            )
                return null;
            usage = {
                completionAudioTokens: new TextEncoder().encode(
                    body.input as string,
                ).length,
            };
        } else return null;
        if (!Object.values(definition.cost).some((rate) => (rate ?? 0) > 0))
            return null;
        limits = Object.entries(usage).map(([unit, maximum]) => ({
            units: [unit as UsageType],
            maximum,
        }));
    }
    const maximum = calculateUsagePriceCeiling(entry.id, definition, limits);
    return maximum === null ? null : { maximum, usage };
}
