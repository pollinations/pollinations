import { DEFAULT_REALTIME_MODEL } from "@shared/registry/realtime.ts";
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
    .passthrough();

export type RealtimeRequestQueryParams = z.infer<
    typeof RealtimeRequestQueryParamsSchema
>;
