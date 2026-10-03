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
            "Case-insensitive match against canonical name, aliases, title, description and publisher; every space-separated word must appear in that text. Combined with `capabilities` and `agent`, which must all match.",
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
                !capabilities ||
                capabilities.every(
                    (capability) =>
                        ModelCapabilitySchema.safeParse(capability).success,
                ),
            {
                message:
                    "Unknown capability. Valid values are listed in the capabilities field of /models.",
            },
        )
        .meta({
            description:
                "Comma- or pipe-separated capabilities that every returned model must list, e.g. `tool_calling,reasoning`.",
        }),
    agent: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Filter by agent status: `true`/`1` for agents only, `false`/`0` to exclude agents.",
    }),
    limit: z.coerce.number().int().min(1).max(500).optional().meta({
        description:
            "Return at most this many models, applied after every other filter. Omit for the full list.",
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
