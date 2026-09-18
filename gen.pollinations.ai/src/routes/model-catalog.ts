import type { Context } from "hono";
import type { Env } from "@/env.ts";
import type {
    ModelListHeaders,
    ModelListQueryParams,
} from "@/schemas/models.ts";
import type { GenerationModelEntry } from "../model-registry.ts";

// Discovery only: callers apply access checks before entering this function.
export function filterCatalogEntries(
    c: Context<Env>,
    entries: GenerationModelEntry[],
): GenerationModelEntry[] {
    const query = c.req.valid("query" as never) as ModelListQueryParams;
    const headers = c.req.valid("header" as never) as ModelListHeaders;
    const communitySource =
        query.community === undefined
            ? undefined
            : query.community === "true" || query.community === "1"
              ? "community"
              : "official";
    const source =
        query.source ?? communitySource ?? headers["pollinations-model-source"];
    return entries.filter(
        (entry) =>
            source === undefined ||
            entry.info.community === (source === "community"),
    );
}
