import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Filter by community status: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models.",
    }),
    source: z
        .enum(["official", "community", "all"])
        .optional()
        .meta({
            description:
                "Filter by source: `official` for built-in models only, `community` for community models only, `all` (default when omitted) for both. Equivalent to `community=false`, `community=true`, and omitted, respectively.",
        }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;
