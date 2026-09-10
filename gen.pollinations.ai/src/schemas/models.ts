import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models.",
    }),
    official: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Filter by official status: `true`/`1` for official-only, `false`/`0` for community-only.",
    }),
    reliable: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Filter by reliability: `true`/`1` for reliable models (success_rate >= 0.70).",
    }),
    filter: z.string().optional().meta({
        description:
            "Filter string or comma-separated filters: `official`, `reliable`, `community`. Supports `x-pollinations-model-filter` header equivalent.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;
