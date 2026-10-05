import { ModelCapabilitySchema } from "@shared/registry/model-info.ts";
import { z } from "zod";

// One query value can carry several entries: `|` matches the separator the
// other list parameters use, `,` reads naturally in a hand-written URL.
export function splitList(value: string): string[] {
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
            "Case-insensitive text search over each model's canonical name, aliases, title, description and publisher. Every whitespace-separated word must appear somewhere in that text, so words can match different fields. Combines with the other filters using AND semantics.",
    }),
    capabilities: z
        .string()
        .transform(parseList)
        .refine(
            (capabilities) =>
                capabilities.every(
                    (capability) =>
                        ModelCapabilitySchema.safeParse(capability).success,
                ),
            {
                message:
                    "Unknown capability. Supported values: tool_calling, reasoning, web_search, code_execution, pollinations_models.",
            },
        )
        .optional()
        .meta({
            description:
                "Keep only models advertising every listed capability (AND semantics). Separate multiple values with `|` or `,`, for example `capabilities=tool_calling,reasoning`. Supported values: tool_calling, reasoning, web_search, code_execution, pollinations_models; any other value returns 400 Bad Request.",
        }),
    agent: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Agent filter: `true`/`1` for agents only, `false`/`0` to exclude them.",
    }),
    limit: z.coerce.number().int().min(1).max(500).optional().meta({
        description:
            "Maximum number of models to return. Applied after visibility, API-key permissions, source, reliability and every other filter, so catalog order decides which models fit.",
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
