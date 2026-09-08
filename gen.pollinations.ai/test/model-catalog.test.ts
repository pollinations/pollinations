import { expect, test } from "vitest";
import {
    catalogHealth,
    parseCatalogFilters,
} from "../src/routes/model-catalog.ts";
import type { getModelHealthSnapshot } from "../src/routes/model-status.ts";

test("catalog query takes precedence over client headers", () => {
    const headers = new Headers({
        "X-Pollinations-Model-Source": "community",
        "X-Pollinations-Model-Reliability": "reliable",
    });
    expect(
        parseCatalogFilters(
            { source: "official", reliability: "all" },
            headers,
        ),
    ).toEqual({ source: "official", reliability: "all" });
    expect(parseCatalogFilters({}, headers)).toEqual({
        source: "community",
        reliability: "reliable",
    });
    expect(parseCatalogFilters({}, new Headers())).toEqual({
        source: undefined,
        reliability: undefined,
    });
});

test("invalid and conflicting filters fail explicitly", () => {
    for (const query of [
        { source: "typo" },
        { reliability: "healthy" },
        { source: "official", community: "true" },
    ]) {
        expect(() => parseCatalogFilters(query, new Headers())).toThrow();
    }
    expect(() =>
        parseCatalogFilters(
            {},
            new Headers({ "X-Pollinations-Model-Source": "typo" }),
        ),
    ).toThrow();
    expect(parseCatalogFilters({ community: "0" }, new Headers()).source).toBe(
        "official",
    );
});

test("health counts final fallback successes, excludes 4xx, and matches event type", () => {
    const now = Date.parse("2026-09-08T12:00:00Z");
    const row = {
        model: "example",
        event_type: "generate.text",
        provider: "test",
        model_used: "example",
        total_requests: 200,
        status_2xx: 96,
        errors_4xx: 100,
        errors_5xx: 4,
        own_calls: 100,
        own_calls_ok: 80,
        primary_5xx: 20,
        primary_retried_503s: 16,
        fallback_rescues: 16,
        last_error_at: "",
        latency_p50_ms: null,
        latency_p95_ms: null,
        avg_latency_ms: null,
        last_request_at: "2026-09-08 11:59:00",
        tokens_per_second: null,
    };
    const snapshot: Awaited<ReturnType<typeof getModelHealthSnapshot>> = {
        data: {
            data: [
                row,
                {
                    ...row,
                    event_type: "generate.image",
                    status_2xx: 0,
                    errors_5xx: 100,
                },
            ],
        },
        timestamp: now,
        stale: false,
    };
    const entry = { id: "example", eventType: "generate.text" as const };
    expect(catalogHealth(entry, snapshot, now)).toMatchObject({
        success_rate: 0.96,
        sample_count: 100,
        window_minutes: 60,
        stale: false,
    });
    expect(catalogHealth(entry, { ...snapshot, stale: true }, now).stale).toBe(
        true,
    );
    expect(catalogHealth(entry, snapshot, now + 60_000).stale).toBe(true);
    expect(catalogHealth(entry, null, now)).toMatchObject({
        success_rate: null,
        sample_count: 0,
        checked_at: null,
        stale: true,
    });
    expect(
        catalogHealth({ ...entry, id: "unobserved" }, snapshot, now)
            .success_rate,
    ).toBeNull();
    expect(
        catalogHealth(
            entry,
            {
                ...snapshot,
                data: { data: [{ ...row, status_2xx: 0, errors_5xx: 0 }] },
            },
            now,
        ).success_rate,
    ).toBeNull();
});
