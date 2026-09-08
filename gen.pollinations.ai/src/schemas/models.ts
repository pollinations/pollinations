import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    source: z.enum(["all", "official", "community"]).optional().meta({
        description:
            "Filter discovery by source. Overrides X-Pollinations-Model-Source; omit for all sources.",
    }),
    reliability: z.enum(["all", "reliable"]).optional().meta({
        description:
            "Include health metadata (all) or return only fresh models with less than 5% final server errors (reliable). Overrides X-Pollinations-Model-Reliability. Does not restrict generation.",
    }),
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;
