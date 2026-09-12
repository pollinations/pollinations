import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    source: z
        .enum(["official", "community"])
        .optional()
        .meta({
            description:
                "Filter by model source: `official` for built-in models, `community` for community models. Omit for all models.",
        }),
    reliable: z
        .enum(["true", "false", "1", "0"])
        .optional()
        .meta({
            description:
                "Filter to models with proven reliability: health data in the default window must show a success rate of at least 0.9 with at least one sample. Models without health data are excluded.",
        }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;

// Reliability threshold for the `reliable` model list filter: a model counts
// as reliable when its health window shows at least this success rate.
export const RELIABLE_SUCCESS_RATE_THRESHOLD = 0.9;
