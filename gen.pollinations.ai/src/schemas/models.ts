import { z } from "zod";

// Multi-value discovery filters arrive as `a,b` or `a|b`, matching the other
// list-style query params on this gateway.
const parseListParam = (value: string) =>
    (value.includes("|") ? value.split("|") : value.split(","))
        .map((item) => item.trim())
        .filter(Boolean);

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
            "Discovery search over canonical name, aliases, title, description and publisher. Case-insensitive; every whitespace-separated word must match somewhere in that text. Visibility, API-key permissions, source and reliability filters still apply first, and limit trims last.",
    }),
    capabilities: z.string().transform(parseListParam).optional().meta({
        description:
            "Keep only models advertising every listed capability (AND semantics), comma- or pipe-separated: `capabilities=tool_calling,reasoning`. Capability matching ignores case, spaces, `-` and `_`, so `web-search` and `web search` both match `web_search`.",
    }),
    agent: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Agent filter: `true`/`1` keeps only agents, `false`/`0` drops agents. Omit to return both.",
    }),
    limit: z.coerce.number().int().min(1).optional().meta({
        description:
            "Return at most this many models. Applied last, so visibility, API-key permissions, source, reliability and the catalog ordering all still decide which models are eligible.",
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
