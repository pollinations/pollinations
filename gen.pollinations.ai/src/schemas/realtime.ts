import { DEFAULT_REALTIME_MODEL } from "@shared/registry/registry.ts";
import { z } from "zod";

export const RealtimeRequestQueryParamsSchema = z
    .object({
        model: z
            .literal(DEFAULT_REALTIME_MODEL)
            .optional()
            .default(DEFAULT_REALTIME_MODEL)
            .meta({
                description:
                    "Realtime model to use. Currently only gpt-realtime-2 is supported.",
            }),
        key: z.string().optional().meta({
            description:
                "Pollinations API key. Useful for browser WebSocket clients that cannot set custom Authorization headers.",
        }),
    })
    .strict();

export type RealtimeRequestQueryParams = z.infer<
    typeof RealtimeRequestQueryParamsSchema
>;

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

export type RealtimeUsage = z.infer<typeof RealtimeUsageSchema>;
