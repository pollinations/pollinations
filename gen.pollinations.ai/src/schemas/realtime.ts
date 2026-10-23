import { DEFAULT_REALTIME_MODEL } from "@shared/registry/realtime.ts";
import { z } from "zod";

export const RealtimeRequestQueryParamsSchema = z
    .object({
        model: z
            .string()
            .min(1)
            .optional()
            .default(DEFAULT_REALTIME_MODEL)
            .meta({
                description:
                    "Realtime model ID or alias, including a registered community realtime model. Discover available models through /models.",
            }),
        key: z.string().optional().meta({
            description:
                "Pollinations API key. Useful for browser WebSocket clients that cannot set custom Authorization headers.",
        }),
    })
    .strict();
