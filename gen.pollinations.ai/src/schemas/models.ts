import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    source: z.enum(["all", "official", "community"]).optional().meta({
        description:
            "Filter by model source. Omit or use `all` for every accessible model.",
    }),
    reliability: z.enum(["all", "reliable"]).optional().meta({
        description:
            "Set to `all` to include health metadata, or `reliable` to return only fresh models with at least 10 eligible samples and a 90% success rate.",
    }),
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Legacy source filter: `true`/`1` for community-only, `false`/`0` for official-only. Prefer `source`.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;
