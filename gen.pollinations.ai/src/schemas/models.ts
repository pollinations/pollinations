import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models.",
    }),
    reliability: z.enum(["reliable", "all"]).optional().meta({
        description:
            "Filter by recent reliability: `reliable` keeps only models with a high success rate on enough recent traffic. Omit for all models.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;
