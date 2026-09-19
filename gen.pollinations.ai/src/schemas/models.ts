import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    source: z.enum(["official", "community"]).optional().meta({
        description:
            "Filter by source. Omit for both official and community models.",
    }),
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Legacy source filter: `true`/`1` for community, `false`/`0` for official.",
    }),
    reliability: z.enum(["all", "reliable"]).optional().meta({
        description:
            "`reliable` hides models whose measured health is `down`. Healthy, degraded, and unknown (including no data) stay. Default is `all`. Discovery-only; does not change generation permissions.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;

// Reuse the query enum for header validation and OpenAPI documentation.
export const ModelListHeadersSchema = z.object({
    "pollinations-model-source": ModelListQueryParamsSchema.shape.source,
});
export type ModelListHeaders = z.infer<typeof ModelListHeadersSchema>;
