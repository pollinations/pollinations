import { z } from "zod";

export const ModelHealthSchema = z
    .object({
        success_rate: z.number().min(0).max(1).nullable(),
        sample_count: z.number().int().nonnegative(),
        window_minutes: z.number().int().positive(),
        checked_at: z.string().nullable(),
        last_request_at: z.string().nullable(),
        stale: z.boolean(),
    })
    .meta({
        description:
            "Final successes / eligible final responses, including successful fallback rescues and excluding caller 4xx. Image-provider 4xx failures are included alongside 5xx. Null means unknown, including image feeds without provider-failure attribution. Freshness refers to the health feed and last observed request; experimental status is independent.",
    });
