import { HTTPException } from "hono/http-exception";
import type { GenerationModelEntry } from "../model-registry.ts";
import { ModelListQueryParamsSchema } from "../schemas/models.ts";
import { getModelHealthSnapshot } from "./model-status.ts";

const WINDOW_MINUTES = 60;

export function parseCatalogFilters(
    query: Record<string, string | undefined>,
    headers: Headers,
) {
    const result = ModelListQueryParamsSchema.safeParse({
        ...query,
        source:
            query.source ??
            headers.get("X-Pollinations-Model-Source") ??
            undefined,
        reliability:
            query.reliability ??
            headers.get("X-Pollinations-Model-Reliability") ??
            undefined,
    });
    if (!result.success)
        throw new HTTPException(400, {
            message:
                "Invalid model filter: source must be all, official or community; reliability must be all or reliable.",
        });
    const { source, reliability, community } = result.data;
    const legacy =
        community === undefined
            ? undefined
            : community === "true" || community === "1"
              ? "community"
              : "official";
    if (source !== undefined && legacy !== undefined && source !== legacy) {
        throw new HTTPException(400, {
            message: "source and community filters conflict",
        });
    }
    return { source: source ?? legacy, reliability };
}

type Snapshot = Awaited<ReturnType<typeof getModelHealthSnapshot>>;

export function catalogHealth(
    entry: Pick<GenerationModelEntry, "id" | "eventType">,
    snapshot: Snapshot,
    now = Date.now(),
) {
    const rows =
        snapshot?.data.data.filter(
            (row) =>
                row.model === entry.id && row.event_type === entry.eventType,
        ) ?? [];
    const successes = rows.reduce((sum, row) => sum + row.status_2xx, 0);
    const samples =
        successes + rows.reduce((sum, row) => sum + row.errors_5xx, 0);
    const lastRequest = Math.max(
        0,
        ...rows.map((row) => {
            const value = row.last_request_at.replace(" ", "T");
            return (
                Date.parse(
                    /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`,
                ) || 0
            );
        }),
    );
    const stale =
        !snapshot ||
        snapshot.stale ||
        now - snapshot.timestamp >= 60_000 ||
        !lastRequest ||
        now - lastRequest > WINDOW_MINUTES * 60_000;
    return {
        success_rate: samples ? successes / samples : null,
        sample_count: samples,
        window_minutes: WINDOW_MINUTES,
        checked_at: snapshot
            ? new Date(snapshot.timestamp).toISOString()
            : null,
        last_request_at: lastRequest
            ? new Date(lastRequest).toISOString()
            : null,
        stale: Boolean(stale),
    };
}

// Receives the caller-visible, permission-filtered view. Never mutates the
// registry: discovery preferences must not affect generation authorization.
export async function filterCatalog(
    entries: GenerationModelEntry[],
    filters: ReturnType<typeof parseCatalogFilters>,
) {
    const sourced = entries.filter(
        (entry) =>
            !filters.source ||
            filters.source === "all" ||
            (entry.info.community ? "community" : "official") ===
                filters.source,
    );
    if (!filters.reliability) return sourced;
    const snapshot = await getModelHealthSnapshot(WINDOW_MINUTES);
    return sourced
        .map((entry) => ({
            ...entry,
            info: { ...entry.info, health: catalogHealth(entry, snapshot) },
        }))
        .filter(
            (entry) =>
                filters.reliability === "all" ||
                (!entry.info.health.stale &&
                    entry.info.health.success_rate !== null &&
                    entry.info.health.success_rate > 0.95),
        );
}
