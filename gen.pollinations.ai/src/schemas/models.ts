import { z } from "zod";

export const ModelListQueryParamsSchema = z.object({
    source: z.enum(["official", "community", "all"]).optional().meta({
        description:
            "Filter by model source: `official` for first-party registry models, `community` for community-published models. Omit or `all` for every model.",
    }),
    reliable: z.enum(["true", "false", "1", "0"]).optional().meta({
        description:
            "`true`/`1` keeps only models with sufficient observed health (success rate >= 0.9 across >= 10 samples in the current health window). Models without health data are treated as unknown and excluded. `false`/`0` keeps every model.",
    }),
});

export type ModelListQueryParams = z.infer<typeof ModelListQueryParamsSchema>;

// Clients such as Open WebUI, LibreChat, and Cline append `/models` to a
// configured base URL, so query parameters embedded in the base URL break
// discovery. The same filters can be sent as this header in URL query
// format, e.g. `X-Pollinations-Model-Filter: source=official&reliable=true`.
export const MODEL_FILTER_HEADER = "X-Pollinations-Model-Filter";
