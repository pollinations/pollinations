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
import {
    getModelHealthSnapshot,
    ModelHealthRowSchema,
} from "./model-status.ts";

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
    const snapshot = await getModelHealthSnapshot(c, WINDOW_MINUTES).catch(
        () => null,
    );
    const checkedAt = snapshot?.timestamp ?? null;
    const stale = snapshot?.stale ?? true;
    const unknown = modelHealthFromCounts(
        0,
        0,
        WINDOW_MINUTES,
        checkedAt,
        stale,
    );
    const healthByModel = new Map<string, ModelHealth>();
    for (const rawRow of snapshot?.data.data ?? []) {
        const parsed = ModelHealthRowSchema.safeParse(rawRow);
        if (!parsed.success) continue;
        const row = parsed.data;
        // The feed is already grouped by resolved model and generation modality.
        // status_2xx includes successful fallback rescues; never add them twice.
        healthByModel.set(
            `${row.model}\0${row.event_type}`,
            modelHealthFromCounts(
                row.status_2xx,
                row.errors_5xx,
                WINDOW_MINUTES,
                checkedAt,
                stale,
            ),
        );
    }
    return filtered.flatMap((entry) => {
        const health =
            healthByModel.get(`${entry.id}\0${entry.eventType}`) ?? unknown;
        if (
            status === "healthy" &&
            (health.status !== "healthy" || health.stale)
        )
            return [];
        return [{ ...entry, info: { ...entry.info, health } }];
    });
}
