import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    source: z.enum(["official", "community"]).optional().meta({
        description:
            "Filter by source. Omit for both official and community models.",
    }),
    reliability: z.enum(["all", "reliable"]).optional().meta({
        description:
            "Include measured health for all models, or return only models with status `on`. Omit to skip health lookup.",
    }),
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Legacy source filter: `true`/`1` for community, `false`/`0` for official.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;
