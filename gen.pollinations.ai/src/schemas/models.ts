import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    source: z.enum(["official", "community"]).optional().meta({
        description:
            "Filter by model source: `official` for Pollinations-operated models only, `community` for community models only. Omit for all models.",
    }),
    reliability: z.enum(["all", "reliable"]).optional().meta({
        description:
            "`reliable` keeps only models whose measured health is not poor: healthy or degraded (or unknown when there is no data). `all` (default) returns every model. Experimental status is separate from reliability.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;
