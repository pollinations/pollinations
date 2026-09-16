import {
    type ModelHealth,
    modelHealthFromCounts,
} from "@shared/registry/model-health.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import type {
    ModelListHeaders,
    ModelListQueryParams,
} from "@/schemas/models.ts";
import type { GenerationModelEntry } from "../model-registry.ts";
import { fetchModelHealth, type ModelHealthRow } from "./model-status.ts";

const WINDOW_MINUTES = 24 * 60;

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
    const status = query.status ?? headers["pollinations-model-status"];
    const filtered = entries.filter(
        (entry) =>
            source === undefined ||
            entry.info.community === (source === "community"),
    );
    if (status === undefined) return filtered;

    // A missing feed must not turn discovery into a 502 or label a model healthy.
    const rows = await fetchModelHealth(String(WINDOW_MINUTES))
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => (body as { data: ModelHealthRow[] } | null)?.data)
        .catch(() => undefined);
    const unknown = modelHealthFromCounts(0, 0, WINDOW_MINUTES);
    const healthByModel = new Map<string, ModelHealth>();
    // Rollup rows are what callers experienced: status_2xx already counts
    // successful fallback rescues, so route rows must not be added on top.
    for (const row of rows ?? []) {
        if (!row.is_rollup) continue;
        healthByModel.set(
            `${row.model}\0${row.event_type}`,
            modelHealthFromCounts(
                row.status_2xx,
                row.errors_5xx,
                WINDOW_MINUTES,
            ),
        );
    }
    return filtered.flatMap((entry) => {
        const health =
            healthByModel.get(`${entry.id}\0${entry.eventType}`) ?? unknown;
        if (status === "healthy" && health.status !== "healthy") return [];
        return [{ ...entry, info: { ...entry.info, health } }];
    });
}
