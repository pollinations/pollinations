import { z } from "zod";
import { parseBooleanLike } from "@/util.ts";

// `capabilities` may arrive as a repeated query param or as one value with
// `|`/`,` separators (the MCP client joins arrays with `|`). Normalize both to
// a lowercase token list so matching stays case-insensitive.
const CapabilitiesQueryParamSchema = z.preprocess((value) => {
    if (value == null) return undefined;
    const raw = Array.isArray(value) ? value : [value];
    const tokens = raw
        .flatMap((entry) => String(entry).split(/[|,]/))
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean);
    return tokens.length > 0 ? tokens : undefined;
}, z.array(z.string()).optional());

// z.coerce.boolean() turns the string "false" into true; reuse the shared
// boolean-ish parser instead and let unrecognized values fail validation.
const BooleanQueryParamSchema = z.preprocess(
    (value) => parseBooleanLike(value) ?? value,
    z.boolean(),
);

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
    query: z.string().trim().min(1).optional().meta({
        description:
            "Case-insensitive substring match against the catalog text: canonical id, aliases, title, description, and publisher. Apply it after visibility, permissions, source, and reliability so hidden models stay hidden.",
    }),
    capabilities: CapabilitiesQueryParamSchema.meta({
        description:
            "Only return models exposing every listed capability (AND semantics). Repeat the param or use `|`/`,` separators, e.g. `?capabilities=tool_calling|reasoning`.",
    }),
    agent: BooleanQueryParamSchema.optional().meta({
        description:
            "`true` for agents only, `false` to exclude agents. Omit to keep both.",
    }),
    limit: z
        .preprocess((value) => {
            if (value == null || value === "") return undefined;
            const parsed = Number.parseInt(String(value), 10);
            return Number.isNaN(parsed) ? value : parsed;
        }, z.number().int().positive().optional())
        .meta({
            description:
                "Return at most this many models after every filter (visibility, permissions, source, reliability) and the catalog ordering have been applied. Omit for the full list.",
        }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;

// Reuse the query enum for header validation and OpenAPI documentation.
export const ModelListHeadersSchema = z.object({
    "pollinations-model-source": ModelListQueryParamsSchema.shape.source,
    "pollinations-model-reliability":
        ModelListQueryParamsSchema.shape.reliability,
});

export type ModelListCapabilities = z.infer<
    typeof CapabilitiesQueryParamSchema
>;
export type ModelListHeaders = z.infer<typeof ModelListHeadersSchema>;
