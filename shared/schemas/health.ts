import { z } from "zod";

export const ModelHealthSchema = z
    .object({
        success_rate: z.number().min(0).max(1).nullable(),
        sample_count: z.number().int().nonnegative(),
        window_minutes: z.number().int().positive(),
        freshness: z.string().nullable(),
    })
    .meta({
        description: "Minimal health metadata derived from operational metrics",
    });

export type ModelHealth = z.infer<typeof ModelHealthSchema>;
