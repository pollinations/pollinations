import {
    DEFAULT_REALTIME_MODEL,
    REALTIME_MODEL_NAMES,
    REALTIME_SERVICES,
} from "@shared/registry/realtime.ts";
import { z } from "zod";

const VALID_REALTIME_MODELS = [
    ...REALTIME_MODEL_NAMES,
    ...Object.values(REALTIME_SERVICES).flatMap((service) => service.aliases),
] as const;

export const RealtimeRequestQueryParamsSchema = z
    .object({
        model: z
            .enum(VALID_REALTIME_MODELS as unknown as [string, ...string[]])
            .optional()
            .default(DEFAULT_REALTIME_MODEL)
            .meta({
                description: `Realtime model to use. Supported models: ${REALTIME_MODEL_NAMES.join(", ")}.`,
            }),
        key: z.string().optional().meta({
            description:
                "Pollinations API key. Useful for browser WebSocket clients that cannot set custom Authorization headers.",
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
