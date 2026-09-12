import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Deprecated alias for `source`. `true`/`1` = community-only, `false`/`0` = official-only. Omit for all models. If `source` is also set it must agree, otherwise the request is rejected with 400.",
    }),
    source: z.enum(["official", "community", "all"]).optional().meta({
        description:
            "Filter by model source using Enter dashboard terminology: `official` for Pollinations-operated models, `community` for community-published models, `all` for everything (default). Replaces `community`.",
    }),
    include_health: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Attach minimal `health` metadata per model (success rate, sample count, window, freshness). Omitted by default so default listings are unchanged. When `min_success_rate` is set, health is fetched for filtering even if not attached.",
    }),
    health_window: z.coerce
        .number()
        .int()
        .min(1)
        .max(10080)
        .optional()
        .meta({
            description:
                "Rolling health window in minutes (1–10080). Defaults to 60, matching `GET /v1/models/status`. Only used when health is fetched (`include_health=true` or `min_success_rate` set).",
        }),
    min_success_rate: z.coerce.number().min(0).max(1).optional().meta({
        description:
            "Keep only models whose health `success_rate` meets this threshold (0–1). Models with unknown health (no data in the window) are excluded by this filter. Discovery-only: never changes generation permissions.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;
