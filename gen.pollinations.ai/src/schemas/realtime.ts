import {
    DEFAULT_REALTIME_MODEL,
    REALTIME_MODEL_NAMES,
    REALTIME_SERVICES,
    type RealtimeModelName,
} from "@shared/registry/realtime.ts";
import { resolveModelName } from "@shared/registry/registry.ts";
import { z } from "zod";

const REALTIME_MODEL_IDS = Object.entries(REALTIME_SERVICES).flatMap(
    ([name, definition]) => [name, ...(definition.aliases ?? [])],
);

export const RealtimeRequestQueryParamsSchema = z
    .object({
        model: z
            .enum(REALTIME_MODEL_IDS as [string, ...string[]])
            .transform(
                (model): RealtimeModelName =>
                    resolveModelName(model) as RealtimeModelName,
            )
            .optional()
            .default(DEFAULT_REALTIME_MODEL)
            .meta({
                description: `Realtime model to use. Supported models: ${REALTIME_MODEL_NAMES.join(", ")}.`,
            }),
        key: z.string().optional().meta({
            description:
                "Generation API key. Browser WebSockets can use a scoped BYOP user key (sk_) because they cannot set custom Authorization headers. Never use your personal Secret Key or App Key for new browser generation; do not share or log this URL. Server clients should use the Authorization header.",
        }),
    })
    .strict();

// Shape of `response.usage` in the Realtime `response.done` event. Only the
// fields used for billing are declared; everything else is ignored.
const tokenCount = z.number().nonnegative().nullish();

export const RealtimeUsageSchema = z
    .object({
        input_tokens: tokenCount,
        output_tokens: tokenCount,
        input_token_details: z
            .object({
                text_tokens: tokenCount,
                audio_tokens: tokenCount,
                image_tokens: tokenCount,
                cached_tokens: tokenCount,
                cached_tokens_details: z
                    .object({
                        text_tokens: tokenCount,
                        audio_tokens: tokenCount,
                        image_tokens: tokenCount,
                    })
                    .partial()
                    .passthrough()
                    .nullish(),
            })
            .partial()
            .passthrough()
            .nullish(),
        output_token_details: z
            .object({
                text_tokens: tokenCount,
                audio_tokens: tokenCount,
            })
            .partial()
            .passthrough()
            .nullish(),
    })
    .partial()
    .passthrough();
