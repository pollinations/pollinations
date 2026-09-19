import { modelHealthLookup } from "@shared/model-health.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import type {
    ModelListHeaders,
    ModelListQueryParams,
} from "@/schemas/models.ts";
import type { GenerationModelEntry } from "../model-registry.ts";
import { fetchModelHealthRows } from "./model-status.ts";

// Discovery only: callers apply access checks before entering this function.
export async function filterCatalogEntries(
    c: Context<Env>,
    entries: GenerationModelEntry[],
): Promise<GenerationModelEntry[]> {
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
    const filtered = entries.filter(
        (entry) =>
            source === undefined ||
            entry.info.community === (source === "community"),
    );

    // A missing feed must not turn discovery into a 502 or label a model
    // healthy; an empty row set makes every lookup resolve to "unknown".
    const rows = await fetchModelHealthRows().catch(() => []);
    const lookup = modelHealthLookup(rows);
    return filtered.map((entry) => {
        const health = lookup(
            entry.id,
            entry.eventType.replace("generate.", ""),
        );
        return {
            ...entry,
            info: {
                ...entry.info,
                health: {
                    status: health.status,
                    success_rate: health.successRate,
                    requests: health.requests,
                },
            },
        };
    });
}
