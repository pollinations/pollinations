import { ModelCapabilitySchema } from "@shared/registry/model-info.ts";
import { z } from "zod";

// Bounds keep the search parameters useful without letting a single request
// carry unbounded input. 200 characters covers realistic catalog queries;
// ten capabilities covers every meaningful AND combination.
export const MAX_MODEL_QUERY_LENGTH = 200;
export const MAX_MODEL_CAPABILITIES = 10;

export const ModelListQueryParamsSchema = z.object({
    reliability: z.enum(["reliable", "all"]).optional().meta({
        description:
            "Defaults to reliable: public community proxy models need more than 80% success across the last 50 eligible requests within seven days, or no observations. Official models, agents, and private models are unaffected. Fallback rescues count as successes. Use all to bypass only this discovery filter; permissions and private visibility still apply. Exact-ID calls and fallback routing are unaffected.",
    }),
    source: z.enum(["official", "community"]).optional().meta({
        description:
            "Filter by source. Omit for both official and community models.",
    }),
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Legacy source filter: `true`/`1` for community, `false`/`0` for official.",
    }),
    query: z.string().trim().max(MAX_MODEL_QUERY_LENGTH).optional().meta({
        description:
            "Search catalog text: canonical name, aliases, title, description, and publisher. Case-insensitive. Whitespace-separated tokens must all match (AND). Blank values are ignored.",
    }),
    capabilities: z
        .preprocess(
            (value) =>
                typeof value === "string"
                    ? value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean)
                    : value,
            z
                .array(z.string())
                .max(MAX_MODEL_CAPABILITIES)
                .optional()
                .transform((items) =>
                    items === undefined ? undefined : [...new Set(items)],
                )
                .pipe(z.array(ModelCapabilitySchema).optional()),
        )
        .meta({
            description:
                "Comma-separated capabilities (tool_calling, reasoning, web_search, code_execution, pollinations_models). A model must have every listed capability (AND). Duplicates collapse. Unknown capabilities and more than 10 entries are rejected with 400.",
        }),
    agent: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "`true`/`1` for agents only, `false`/`0` to exclude agents. Omit for both.",
    }),
    limit: z.coerce.number().int().min(1).max(500).optional().meta({
        description:
            "Maximum number of models returned, 1-500. Applied after visibility, permissions, source, search, and reliability filters, preserving catalog order.",
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
