import { ModelCapabilitySchema } from "@shared/registry/model-info.ts";
import { z } from "zod";
import { parseBooleanLike } from "@/util.ts";

export const ModelListQueryParamsSchema = z.object({
    reliability: z.enum(["reliable", "all"]).optional().meta({
        description:
            "Defaults to reliable: public community proxy models need more than 80% success across the last 50 eligible requests within seven days, or no observations. Official models, agents, and private models are unaffected. Fallback rescues count as successes. Use all to bypass only this discovery filter; permissions and manual visibility still apply. Exact-ID calls and fallback routing are unaffected.",
    }),
    source: z.enum(["official", "community"]).optional().meta({
        description:
            "Filter by source. Omit for both official and community models.",
    }),
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Legacy source filter: `true`/`1` for community, `false`/`0` for official.",
    }),
    query: z.string().optional().meta({
        description:
            "Case-insensitive search across canonical name, aliases, title, description, and publisher. Matches models whose combined text contains this value.",
    }),
    capabilities: z
        .string()
        .transform((value) =>
            value.includes("|") ? value.split("|") : value.split(","),
        )
        .pipe(z.array(ModelCapabilitySchema))
        .optional()
        .meta({
            description:
                "Require capabilities, separated by `|` or `,`. A model must have every listed capability.",
        }),
    agent: z
        .preprocess((value) => parseBooleanLike(value) ?? value, z.boolean())
        .optional()
        .meta({
            description: "True for agents only, false to exclude agents.",
        }),
    limit: z.coerce.number().int().positive().optional().meta({
        description:
            "Maximum number of models to return after every other filter is applied.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;

// Reuse the query enum for header validation and OpenAPI documentation.
export const ModelListHeadersSchema = z.object({
    "pollinations-model-source": ModelListQueryParamsSchema.shape.source,
    "pollinations-model-reliability":
        ModelListQueryParamsSchema.shape.reliability,
});
export type ModelListHeaders = z.infer<typeof ModelListHeadersSchema>;
