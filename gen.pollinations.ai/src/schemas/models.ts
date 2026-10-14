import { ModelCapabilitySchema } from "@shared/registry/model-info.ts";
import { z } from "zod";

export const splitList = (value: string) =>
    value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

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
    query: z.string().optional().meta({
        description:
            "Search the canonical name, aliases, title, description and publisher. Case-insensitive; every whitespace-separated word must match.",
    }),
    capabilities: z
        .string()
        .optional()
        .refine(
            (value) =>
                splitList(value ?? "").every(
                    (item) => ModelCapabilitySchema.safeParse(item).success,
                ),
            { message: "Unknown capability" },
        )
        .meta({
            description: `Comma-separated capabilities (${ModelCapabilitySchema.options.join(", ")}). A model must have all of them.`,
        }),
    agent: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "`true`/`1` returns only agents, `false`/`0` excludes agents. Omit for both.",
    }),
    limit: z.coerce.number().int().min(1).max(500).optional().meta({
        description:
            "Return at most this many models (1-500), after every other filter and in catalog order.",
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
