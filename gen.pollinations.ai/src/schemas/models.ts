import { ModelCapabilitySchema } from "@shared/registry/model-info.ts";
import { z } from "zod";

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
            "Case-insensitive text search over the canonical name, aliases, title, description, and publisher. Every whitespace-separated word must appear somewhere in that text, so words can match different fields. Combines with the other filters using AND semantics.",
    }),
    capabilities: z
        .string()
        .transform((value) =>
            value
                .split(/[|,]/)
                .map((capability) => capability.trim())
                .filter(Boolean),
        )
        .optional()
        .refine(
            (capabilities) =>
                capabilities === undefined ||
                capabilities.every(
                    (capability) =>
                        ModelCapabilitySchema.safeParse(capability).success,
                ),
            {
                message:
                    "Unknown capability. See the capabilities field of any /models entry for the supported values.",
            },
        )
        .meta({
            description:
                "Capability filter with AND semantics. Separate multiple values with `|` or `,`, for example `tool_calling,reasoning`; every returned model must declare all of them. Supported values: tool_calling, reasoning, web_search, code_execution, pollinations_models.",
        }),
    agent: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Filter by agent status: `true`/`1` for agents only, `false`/`0` to exclude agents.",
    }),
    limit: z.coerce.number().int().min(1).max(500).optional().meta({
        description:
            "Return at most this many models. Applied after access, source, reliability, and the other discovery filters, so catalog ordering is preserved and no inaccessible model is ever returned.",
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
