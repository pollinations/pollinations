import { describe, expect, test, vi } from "vitest";
import type { GenerationModelEntry } from "../src/model-registry.ts";
import {
    filterModelCatalogEntries,
    MODEL_RELIABILITY_HEADER,
    MODEL_SOURCE_HEADER,
    resolveModelCatalogFilters,
} from "../src/routes/model-catalog.ts";
import type {
    ModelHealthRow,
    ModelHealthSnapshot,
} from "../src/routes/model-status.ts";

function model(
    id: string,
    options: {
        aliases?: string[];
        community?: boolean;
        alpha?: boolean;
        eventType?: GenerationModelEntry["eventType"];
    } = {},
): GenerationModelEntry {
    const aliases = options.aliases ?? [];
    return {
        id,
        aliases,
        eventType: options.eventType ?? "generate.text",
        info: {
            name: id,
            aliases,
            community: options.community ?? false,
            alpha: options.alpha,
        },
    } as GenerationModelEntry;
}

function healthRow(
    modelId: string,
    status2xx: number,
    errors5xx: number,
    options: {
        errors4xx?: number;
        fallbackRescues?: number;
        eventType?: string;
    } = {},
): ModelHealthRow {
    const errors4xx = options.errors4xx ?? 0;
    return {
        model: modelId,
        event_type: options.eventType ?? "generate.text",
        provider: "test",
        model_used: modelId,
        total_requests: status2xx + errors5xx + errors4xx,
        status_2xx: status2xx,
        errors_4xx: errors4xx,
        errors_5xx: errors5xx,
        own_calls: status2xx + errors5xx,
        own_calls_ok: status2xx,
        primary_5xx: errors5xx,
        primary_retried_503s: 0,
        fallback_rescues: options.fallbackRescues ?? 0,
        last_error_at: "2026-01-01T00:00:00Z",
        latency_p50_ms: 10,
        latency_p95_ms: 20,
        avg_latency_ms: 12,
        last_request_at: "2026-01-01T00:00:00Z",
        tokens_per_second: 50,
    };
}

function snapshot(rows: ModelHealthRow[], stale = false): ModelHealthSnapshot {
    return {
        data: { data: rows },
        timestamp: Date.parse("2026-01-01T01:00:00Z"),
        stale,
        windowMinutes: 60,
    };
}

describe("model catalog filters", () => {
    test("resolves query, legacy, and persistent client header filters", () => {
        expect(resolveModelCatalogFilters({})).toEqual({ source: "all" });
        expect(resolveModelCatalogFilters({ source: "official" })).toEqual({
            source: "official",
        });
        expect(resolveModelCatalogFilters({ community: "1" })).toEqual({
            source: "community",
        });
        expect(
            resolveModelCatalogFilters(
                {},
                { source: " Official ", reliability: " RELIABLE " },
            ),
        ).toEqual({ source: "official", reliability: "reliable" });

        // URL settings let a client override its persistent headers.
        expect(
            resolveModelCatalogFilters(
                { source: "community", reliability: "all" },
                { source: "invalid", reliability: "invalid" },
            ),
        ).toEqual({ source: "community", reliability: "all" });
    });

    test("rejects invalid headers and conflicting legacy queries", () => {
        expect(() =>
            resolveModelCatalogFilters({}, { source: "trusted" }),
        ).toThrow(`${MODEL_SOURCE_HEADER} must be one of`);
        expect(() =>
            resolveModelCatalogFilters({}, { reliability: "healthy" }),
        ).toThrow(`${MODEL_RELIABILITY_HEADER} must be one of`);
        expect(() =>
            resolveModelCatalogFilters({
                source: "official",
                community: "true",
            }),
        ).toThrow("source and community filters conflict");
    });

    test("filters source without fetching or changing the default payload", async () => {
        const official = model("official/model");
        const community = model("community/user/model", { community: true });
        const loadHealth = vi.fn();

        const result = await filterModelCatalogEntries(
            [official, community],
            { source: "official" },
            loadHealth,
        );

        expect(result).toEqual([{ entry: official }]);
        expect(loadHealth).not.toHaveBeenCalled();
    });

    test("aggregates canonical and unambiguous alias rows before calculating health", async () => {
        const first = model("official/a", {
            aliases: ["a-old", "shared"],
        });
        const second = model("official/b", {
            // A canonical identity wins over an alias; shared is ambiguous.
            aliases: ["official/a", "shared"],
        });
        const result = await filterModelCatalogEntries(
            [first, second],
            { source: "all", reliability: "all" },
            async () =>
                snapshot([
                    healthRow("official/a", 5, 1),
                    healthRow("a-old", 4, 0, {
                        errors4xx: 50,
                        fallbackRescues: 4,
                    }),
                    healthRow("shared", 100, 0),
                    healthRow("official/b", 10, 0),
                ]),
        );

        expect(result[0].health).toMatchObject({
            success_rate: 0.9,
            sample_count: 10,
            stale: false,
        });
        expect(result[1].health).toMatchObject({
            success_rate: 1,
            sample_count: 10,
        });
    });

    test("keeps only fresh 90%-plus models with 10 eligible samples", async () => {
        const reliableAlpha = model("official/reliable-alpha", { alpha: true });
        const lowSample = model("official/low-sample");
        const degraded = model("official/degraded");
        const unknown = model("official/unknown");
        const entries = [reliableAlpha, lowSample, degraded, unknown];
        const rows = [
            healthRow(reliableAlpha.id, 9, 1),
            healthRow(lowSample.id, 9, 0),
            healthRow(degraded.id, 8, 2),
        ];

        const reliable = await filterModelCatalogEntries(
            entries,
            { source: "all", reliability: "reliable" },
            async () => snapshot(rows),
        );
        expect(reliable.map(({ entry }) => entry.id)).toEqual([
            reliableAlpha.id,
        ]);
        expect(reliable[0].entry.info.alpha).toBe(true);

        const stale = await filterModelCatalogEntries(
            entries,
            { source: "all", reliability: "reliable" },
            async () => snapshot(rows, true),
        );
        expect(stale).toEqual([]);
    });

    test("reports unavailable health as explicit unknown instead of failing discovery", async () => {
        const entry = model("official/unknown");
        const result = await filterModelCatalogEntries(
            [entry],
            { source: "all", reliability: "all" },
            async () => {
                throw new Error("Tinybird unavailable");
            },
        );

        expect(result).toEqual([
            {
                entry,
                health: {
                    success_rate: null,
                    sample_count: 0,
                    window_minutes: 60,
                    checked_at: null,
                    stale: true,
                },
            },
        ]);
    });
});
