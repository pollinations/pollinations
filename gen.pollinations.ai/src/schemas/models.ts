import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    source: z.enum(["official", "community"]).optional().meta({
        description:
            "Filter by model source: `official` for first-party models, `community` for community-published models. Omit for both.",
    }),
    reliable: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "`true`/`1` keeps only models with `healthy` status from the monitored health window. Models with degraded, unavailable, or unknown health are excluded. `false`/`0` or omitted keeps every model.",
    }),
    community: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "Backward-compatible alias for `source`: `true`/`1` for community-only, `false`/`0` for official-only. Omit for all models.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;

// Clients such as Open WebUI, LibreChat, and Cline append `/models` to a
// configured base URL, so query parameters embedded in the base URL break
// discovery. The same filters can be sent as this header in URL query
// format, e.g. `X-Pollinations-Model-Filter: source=official&reliable=true`.
export const MODEL_FILTER_HEADER = "X-Pollinations-Model-Filter";
