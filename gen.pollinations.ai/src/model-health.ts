import {
    type ModelHealthRow,
    type ModelHealthSummary,
    type ModelReliability,
    modelReliability,
    summarizeModelHealth,
} from "@shared/registry/model-health.ts";
import type { GenerationModelEntry } from "./model-registry.ts";

// Same public pipe as the /v1/models/status endpoint; minutes matches its
// default window so both surfaces agree.
const HEALTH_PIPE_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health.json";
const HEALTH_PIPE_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";
const HEALTH_WINDOW_MINUTES = 60;
const HEALTH_CACHE_TTL_MS = 60_000;

export type ModelsReliabilityFilter = "reliable" | "all";

export interface ModelHealthAttachment {
    reliability: ModelReliability;
    health: ModelHealthSummary | null;
}

const VALID_RELIABILITIES: ModelsReliabilityFilter[] = ["reliable", "all"];

/**
 * Query params win; the X-Model-Reliability header exists for clients that
 * append /models to a base URL themselves and cannot add query strings
 * (Open WebUI, LibreChat, Cline). Throws on invalid values.
 */
export function parseReliabilityParam(
    queryReliability: string | undefined,
    headerReliability: string | undefined,
): ModelsReliabilityFilter {
    const raw = (queryReliability ?? headerReliability ?? "all").toLowerCase();
    if (!VALID_RELIABILITIES.includes(raw as ModelsReliabilityFilter)) {
        throw new Error(
            `reliability must be one of ${VALID_RELIABILITIES.join(", ")}`,
        );
    }
    return raw as ModelsReliabilityFilter;
}

/**
 * Header mirror of the ?community= query param, for the same clients.
 * Returns the community param value to use, or undefined to leave unset.
 * Throws on invalid values.
 */
export function parseSourceHeader(
    queryCommunity: string | undefined,
    headerSource: string | undefined,
): string | undefined {
    if (queryCommunity !== undefined) return queryCommunity;
    if (headerSource === undefined) return undefined;
    const raw = headerSource.toLowerCase();
    if (raw === "official") return "false";
    if (raw === "community") return "true";
    if (raw === "all") return undefined;
    throw new Error("X-Model-Source must be one of official, community, all");
}

let cachedRows: ModelHealthRow[] | null = null;
let cachedAt = 0;

async function getHealthRows(): Promise<ModelHealthRow[]> {
    const now = Date.now();
    if (cachedRows && now - cachedAt < HEALTH_CACHE_TTL_MS) return cachedRows;
    try {
        const url = new URL(HEALTH_PIPE_URL);
        url.searchParams.set("token", HEALTH_PIPE_TOKEN);
        url.searchParams.set("minutes", String(HEALTH_WINDOW_MINUTES));
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`health feed ${response.status}`);
        const body = (await response.json()) as { data?: ModelHealthRow[] };
        cachedRows = Array.isArray(body.data) ? body.data : [];
        cachedAt = now;
    } catch {
        // No usable feed: keep serving the catalog with unknown health rather
        // than failing discovery. Stale cache (if any) still applies.
        if (!cachedRows) cachedRows = [];
    }
    return cachedRows;
}

export async function getModelHealthAttachments(
    modelIds: string[],
): Promise<Map<string, ModelHealthAttachment>> {
    const rows = await getHealthRows();
    const attachments = new Map<string, ModelHealthAttachment>();
    for (const id of modelIds) {
        const summary = summarizeModelHealth(rows, id, HEALTH_WINDOW_MINUTES);
        attachments.set(id, {
            reliability: modelReliability(summary),
            health: summary,
        });
    }
    return attachments;
}

export function attachmentFor(
    attachments: Map<string, ModelHealthAttachment>,
    entry: GenerationModelEntry,
): ModelHealthAttachment | undefined {
    return (
        attachments.get(entry.id) ??
        (entry.info.name !== entry.id
            ? attachments.get(entry.info.name)
            : undefined)
    );
}

/**
 * Applies the reliability filter after permission filtering, so access rules
 * and default listings are untouched. Unknown reliability never matches.
 */
export function filterEntriesByReliability(
    entries: GenerationModelEntry[],
    reliability: ModelsReliabilityFilter,
    attachments: Map<string, ModelHealthAttachment>,
): GenerationModelEntry[] {
    if (reliability === "all") return entries;
    return entries.filter(
        (entry) =>
            attachmentFor(attachments, entry)?.reliability === "reliable",
    );
}

/** Model ids plus display names, so health rows match either key. */
export function attachmentKeysFor(entries: GenerationModelEntry[]): string[] {
    const keys = new Set<string>();
    for (const entry of entries) {
        keys.add(entry.id);
        keys.add(entry.info.name);
    }
    return [...keys];
}
