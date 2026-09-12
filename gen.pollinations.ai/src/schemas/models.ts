import { z } from "zod";

// Clients such as Open WebUI, LibreChat and Cline build catalog URLs by
// appending `/models` to a configured base URL, which discards any query string
// the user tried to set. They can all send custom headers, so every filter here
// is also readable from a header.
export const SOURCE_HEADER = "X-Pollinations-Model-Source";
export const RELIABILITY_HEADER = "X-Pollinations-Model-Reliability";
export const HEALTH_HEADER = "X-Pollinations-Model-Health";

export const ModelSourceSchema = z.enum(["all", "official", "community"]);
export const ModelReliabilitySchema = z.enum(["all", "reliable"]);

export type ModelSource = z.infer<typeof ModelSourceSchema>;
export type ModelReliability = z.infer<typeof ModelReliabilitySchema>;

export const ModelListQueryParamsSchema = z.object({
    source: ModelSourceSchema.optional().meta({
        description:
            "Filter by who publishes the model: `official` for Pollinations-operated models, `community` for models published by other accounts, `all` (the default) for both. Also readable from the `X-Pollinations-Model-Source` header for clients that append `/models` to a base URL and cannot pass a query string.",
    }),
    reliability: ModelReliabilitySchema.optional().meta({
        description:
            "Filter by observed health: `reliable` returns only models whose recent success rate and sample size both clear the thresholds, `all` (the default) returns every model. Models with no health data are treated as unknown and are excluded by `reliable`. Also readable from the `X-Pollinations-Model-Reliability` header.",
    }),
    health: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Set to `true` to include a `health` object on every model: `status`, `success_rate`, `sample_size`, `window_minutes`, `checked_at` and `stale`. Implied by `reliability=reliable`. Also readable from the `X-Pollinations-Model-Health` header.",
    }),
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Deprecated, superseded by `source`. `true`/`1` is equivalent to `source=community`, `false`/`0` to `source=official`. Ignored when `source` is present.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;

const isTruthy = (value: string | undefined) =>
    value === "true" || value === "1";

/**
 * Resolve the effective filters from query parameters, falling back to headers,
 * and finally to the deprecated `community` parameter. Query wins over header so
 * an explicit URL always beats a client-wide default.
 */
export function resolveModelListFilters(
    query: ModelListQueryParams,
    header: (name: string) => string | undefined,
): { source: ModelSource; reliability: ModelReliability; health: boolean } {
    const sourceHeader = ModelSourceSchema.safeParse(
        header(SOURCE_HEADER)?.toLowerCase(),
    );
    const reliabilityHeader = ModelReliabilitySchema.safeParse(
        header(RELIABILITY_HEADER)?.toLowerCase(),
    );

    let source: ModelSource = "all";
    if (query.source) source = query.source;
    else if (sourceHeader.success) source = sourceHeader.data;
    else if (query.community !== undefined) {
        source = isTruthy(query.community) ? "community" : "official";
    }

    const reliability: ModelReliability =
        query.reliability ??
        (reliabilityHeader.success ? reliabilityHeader.data : "all");

    // Asking for reliable models without showing why would be unhelpful.
    const health =
        reliability === "reliable" ||
        (query.health !== undefined
            ? isTruthy(query.health)
            : isTruthy(header(HEALTH_HEADER)?.toLowerCase()));

    return { source, reliability, health };
}
