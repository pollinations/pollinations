import type { BillingRules } from "./registry";

const PER_MILLION = 1_000_000;

type RealtimeBillingOutput = {
    response?: {
        usage?: {
            input_token_details?: {
                cached_tokens_details?: {
                    audio_tokens?: unknown;
                    image_tokens?: unknown;
                };
            };
        };
    };
    streamEvents?: unknown[];
};

function outputEvents(output: unknown): unknown[] {
    const value = output as RealtimeBillingOutput | undefined;
    return Array.isArray(value?.streamEvents)
        ? value.streamEvents
        : value
          ? [value]
          : [];
}

function countCachedTokens(
    output: unknown,
    modality: "audio" | "image",
): number {
    return outputEvents(output).reduce<number>((total, event) => {
        const details = (event as RealtimeBillingOutput | undefined)?.response
            ?.usage?.input_token_details?.cached_tokens_details;
        const value =
            modality === "audio"
                ? details?.audio_tokens
                : details?.image_tokens;
        return (
            total +
            (typeof value === "number" && Number.isFinite(value) && value > 0
                ? value
                : 0)
        );
    }, 0);
}

// Generic cached input is billed at the cached-text rate. The provider reports
// cached audio and image tokens separately, so these rules add only the
// modality-specific difference and keep both usage and totals exact.
export const OPENAI_REALTIME_2_1_MINI_CACHE_BILLING: BillingRules = {
    adjustments: [
        {
            id: "openai.realtime.cached_audio_delta.v1",
            description:
                "Cached audio input costs $0.30/M instead of the $0.06/M cached-text base rate.",
            kind: "cached_audio_input",
            unit: "token",
            unitCost: (0.3 - 0.06) / PER_MILLION,
            countUnits: (output) => countCachedTokens(output, "audio"),
        },
        {
            id: "openai.realtime.cached_image_delta.v1",
            description:
                "Cached image input costs $0.08/M instead of the $0.06/M cached-text base rate.",
            kind: "cached_image_input",
            unit: "token",
            unitCost: (0.08 - 0.06) / PER_MILLION,
            countUnits: (output) => countCachedTokens(output, "image"),
        },
    ],
};
