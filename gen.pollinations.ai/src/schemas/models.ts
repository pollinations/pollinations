import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;

export const V1ModelListQueryParamsSchema = z.object({
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models. Deprecated: use `source` instead.",
    }),
    source: z.enum(["official", "community"]).optional().meta({
        description:
            "Filter by model source: `official` for built-in models, `community` for publisher models. Omit for all models.",
    }),
    health: z.enum(["true", "1"]).optional().meta({
        description:
            "Include health metadata for each model. Health shows recent success rate, sample size, and status (on/degraded/off/unknown).",
    }),
});

export type V1ModelListQueryParams = z.infer<
    typeof V1ModelListQueryParamsSchema
>;
