import {
    DEFAULT_REALTIME_MODEL,
    OPENAI_REALTIME_MODEL_NAMES,
} from "@shared/registry/realtime.ts";
import { z } from "zod";
import { parseBooleanLike } from "@/util.ts";

const BooleanQueryParamSchema = z.preprocess(
    (value) => parseBooleanLike(value) ?? value,
    z.boolean(),
);

export const RealtimeRequestQueryParamsSchema = z
    .object({
        model: z
            .enum(OPENAI_REALTIME_MODEL_NAMES as [string, ...string[]])
            .optional()
            .default(DEFAULT_REALTIME_MODEL)
            .meta({
                description: `Realtime model to use. Supported models: ${OPENAI_REALTIME_MODEL_NAMES.join(", ")}.`,
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

export const SCRIBE_REALTIME_AUDIO_FORMATS = [
    "pcm_8000",
    "pcm_16000",
    "pcm_22050",
    "pcm_24000",
    "pcm_44100",
    "pcm_48000",
    "ulaw_8000",
] as const;

export type ScribeRealtimeAudioFormat =
    (typeof SCRIBE_REALTIME_AUDIO_FORMATS)[number];

export const ScribeRealtimeRequestQueryParamsSchema = z
    .object({
        model: z
            .literal("scribe-realtime")
            .optional()
            .default("scribe-realtime"),
        key: z.string().optional().meta({
            description:
                "Pollinations API key for browser WebSocket clients that cannot set custom Authorization headers.",
        }),
        audio_format: z
            .enum(SCRIBE_REALTIME_AUDIO_FORMATS)
            .optional()
            .default("pcm_16000"),
        language_code: z.string().min(2).max(3).optional(),
        commit_strategy: z.enum(["manual", "vad"]).optional().default("manual"),
        vad_threshold: z.coerce.number().min(0).max(1).optional(),
        vad_silence_threshold_secs: z.coerce.number().positive().optional(),
        min_speech_duration_ms: z.coerce
            .number()
            .int()
            .nonnegative()
            .optional(),
        min_silence_duration_ms: z.coerce
            .number()
            .int()
            .nonnegative()
            .optional(),
        include_timestamps: BooleanQueryParamSchema.optional().default(false),
        include_language_detection:
            BooleanQueryParamSchema.optional().default(false),
        no_verbatim: BooleanQueryParamSchema.optional().default(false),
        filter_background_audio:
            BooleanQueryParamSchema.optional().default(false),
    })
    .strict()
    .refine(
        (query) => !(query.filter_background_audio && query.include_timestamps),
        {
            message:
                "filter_background_audio cannot be combined with include_timestamps",
            path: ["filter_background_audio"],
        },
    );

export type ScribeRealtimeRequestQueryParams = z.infer<
    typeof ScribeRealtimeRequestQueryParamsSchema
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
