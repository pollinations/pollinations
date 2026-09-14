import type { ModelHealth } from "@shared/registry/model-health.ts";
import debug from "debug";
import { HTTPException } from "hono/http-exception";
import type { ModelListQueryParams } from "@/schemas/models.ts";
import type { GenerationModelEntry } from "../model-registry.ts";
import {
    DEFAULT_MODEL_HEALTH_MINUTES,
    getModelHealthSnapshot,
    type ModelHealthSnapshot,
} from "./model-status.ts";

const log = debug("pollinations:model-catalog");

export const MODEL_SOURCE_HEADER = "X-Pollinations-Model-Source";
export const MODEL_RELIABILITY_HEADER = "X-Pollinations-Model-Reliability";
export const RELIABLE_SUCCESS_RATE = 0.9;
export const RELIABLE_MIN_SAMPLE_COUNT = 10;

type ModelSource = "all" | "official" | "community";
type ModelReliability = "all" | "reliable";

export type ModelCatalogFilters = {
    source: ModelSource;
    reliability?: ModelReliability;
};

export type ModelCatalogHeaders = {
    source?: string;
    reliability?: string;
};

export type CatalogEntry = {
    entry: GenerationModelEntry;
    health?: ModelHealth;
};

type LoadHealthSnapshot = (minutes: number) => Promise<ModelHealthSnapshot>;

function parseHeaderValue<T extends string>(
    name: string,
    value: string | undefined,
    allowed: readonly T[],
): T | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim().toLowerCase();
    if ((allowed as readonly string[]).includes(normalized)) {
        return normalized as T;
    }
    throw new HTTPException(400, {
        message: `${name} must be one of: ${allowed.join(", ")}`,
    });
}

export function resolveModelCatalogFilters(
    query: ModelListQueryParams,
    headers: ModelCatalogHeaders = {},
): ModelCatalogFilters {
    const legacySource =
        query.community === undefined
            ? undefined
            : query.community === "true" || query.community === "1"
              ? "community"
              : "official";

    if (
        query.source !== undefined &&
        legacySource !== undefined &&
        query.source !== legacySource
    ) {
        throw new HTTPException(400, {
            message: "source and community filters conflict",
        });
    }

    const source =
        query.source ??
        legacySource ??
        parseHeaderValue(MODEL_SOURCE_HEADER, headers.source, [
            "all",
            "official",
            "community",
        ] as const) ??
        "all";
    const reliability =
        query.reliability ??
        parseHeaderValue(MODEL_RELIABILITY_HEADER, headers.reliability, [
            "all",
            "reliable",
        ] as const);

    return { source, reliability };
}

function normalizeModelId(value: string): string {
    return value.trim().toLowerCase();
}

function aggregateHealthRows(
    entries: GenerationModelEntry[],
    snapshot: ModelHealthSnapshot,
): Map<GenerationModelEntry, { successes: number; failures: number }> {
    const canonicalOwners = new Map<string, GenerationModelEntry>();
    const aliasOwners = new Map<string, Set<GenerationModelEntry>>();

    for (const entry of entries) {
        canonicalOwners.set(normalizeModelId(entry.id), entry);
    }
    for (const entry of entries) {
        for (const alias of new Set([
            ...entry.aliases,
            ...entry.info.aliases,
        ])) {
            const normalized = normalizeModelId(alias);
            const owners = aliasOwners.get(normalized) ?? new Set();
            owners.add(entry);
            aliasOwners.set(normalized, owners);
        }
    }

    const totals = new Map<
        GenerationModelEntry,
        { successes: number; failures: number }
    >();
    for (const row of snapshot.data.data) {
        const normalized = normalizeModelId(row.model);
        let owner = canonicalOwners.get(normalized);
        if (!owner) {
            const owners = aliasOwners.get(normalized);
            if (owners?.size === 1) owner = owners.values().next().value;
        }
        if (!owner || owner.eventType !== row.event_type) continue;

        const current = totals.get(owner) ?? { successes: 0, failures: 0 };
        // status_2xx already includes successful fallback rescues. Caller-side
        // 4xx responses are excluded from the reliability sample.
        current.successes += row.status_2xx;
        current.failures += row.errors_5xx;
        totals.set(owner, current);
    }
    return totals;
}

function healthForEntry(
    entry: GenerationModelEntry,
    snapshot: ModelHealthSnapshot | null,
    totals: Map<GenerationModelEntry, { successes: number; failures: number }>,
): ModelHealth {
    const counts = totals.get(entry);
    const sampleCount = counts ? counts.successes + counts.failures : 0;
    return {
        success_rate:
            counts && sampleCount > 0 ? counts.successes / sampleCount : null,
        sample_count: sampleCount,
        window_minutes: snapshot?.windowMinutes ?? DEFAULT_MODEL_HEALTH_MINUTES,
        checked_at:
            snapshot === null
                ? null
                : new Date(snapshot.timestamp).toISOString(),
        stale: snapshot?.stale ?? true,
    };
}

function isReliable(health: ModelHealth): boolean {
    return (
        !health.stale &&
        health.sample_count >= RELIABLE_MIN_SAMPLE_COUNT &&
        health.success_rate !== null &&
        health.success_rate >= RELIABLE_SUCCESS_RATE
    );
}

export async function filterModelCatalogEntries(
    entries: GenerationModelEntry[],
    filters: ModelCatalogFilters,
    loadHealthSnapshot: LoadHealthSnapshot = getModelHealthSnapshot,
): Promise<CatalogEntry[]> {
    const sourceFiltered = entries.filter((entry) => {
        if (filters.source === "all") return true;
        return filters.source === "community"
            ? entry.info.community
            : !entry.info.community;
    });

    if (filters.reliability === undefined) {
        return sourceFiltered.map((entry) => ({ entry }));
    }

    let snapshot: ModelHealthSnapshot | null = null;
    try {
        snapshot = await loadHealthSnapshot(DEFAULT_MODEL_HEALTH_MINUTES);
    } catch (error) {
        log("Model health unavailable; returning unknown health: %O", error);
    }
    const totals = snapshot
        ? aggregateHealthRows(entries, snapshot)
        : new Map<
              GenerationModelEntry,
              { successes: number; failures: number }
          >();
    const withHealth = sourceFiltered.map((entry) => ({
        entry,
        health: healthForEntry(entry, snapshot, totals),
    }));

    return filters.reliability === "reliable"
        ? withHealth.filter(({ health }) => isReliable(health))
        : withHealth;
}
