import { z } from "zod";

export const ModelHealthSchema = z.object({
    success_rate: z.number().min(0).max(1).nullable(),
    sample_count: z.number().int().nonnegative(),
    window_minutes: z.number().int().positive(),
    checked_at: z.string().datetime().nullable(),
    stale: z.boolean(),
});

export type ModelHealth = z.infer<typeof ModelHealthSchema>;
