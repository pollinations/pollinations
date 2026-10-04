import { z } from "zod";

// One query value can carry several entries: `|` matches the separator other
// list parameters use, `,` reads naturally in hand-written URLs.
function parseList(value: string): string[] {
    return value
        .split(/[|,]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

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
            "Case-insensitive text search over each model's name, aliases, title, description and publisher. Keeps only models whose catalog text contains the term.",
    }),
    capabilities: z.string().transform(parseList).optional().meta({
        description:
            "Keep models advertising every listed capability: `tool_calling`, `reasoning`, `web_search`, `code_execution`, `pollinations_models`. Separate multiple values with `|` or `,`; every value is required (AND).",
    }),
    agent: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Agent filter: `true`/`1` for agents only, `false`/`0` to exclude them.",
    }),
    limit: z.coerce.number().int().min(1).max(500).optional().meta({
        description:
            "Maximum number of models to return. Applied after visibility, permissions, source, reliability and every other filter, so catalog order decides which models fit.",
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
