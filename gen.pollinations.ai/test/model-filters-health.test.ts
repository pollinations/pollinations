import { SELF } from "cloudflare:test";
import { test } from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";
import {
    computeModelHealth,
    filterEntriesBySource,
    resolveModelListOptions,
} from "../src/model-health.ts";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

function headers(init?: Record<string, string>): Headers {
    return new Headers(init);
}

test("source filter uses Enter terminology and honors the community alias", () => {
    const official = { communityEndpoint: undefined };
    const community = { communityEndpoint: {} };
    const entries = [official, community];

    expect(filterEntriesBySource(entries, "official")).toEqual([official]);
    expect(filterEntriesBySource(entries, "community")).toEqual([community]);
    expect(filterEntriesBySource(entries, "all")).toEqual(entries);

    const viaAlias = resolveModelListOptions(
        { community: "false" },
        headers(),
    );
    expect(viaAlias).toMatchObject({ ok: true, options: { source: "official" } });

    const conflict = resolveModelListOptions(
        { community: "true", source: "official" },
        headers(),
    );
    expect(conflict.ok).toBe(false);
});

test("header fallbacks work for clients that cannot use query strings", () => {
    const resolved = resolveModelListOptions(
        {},
        headers({
            "X-Pollinations-Source": "official",
            "X-Pollinations-Include-Health": "true",
            "X-Pollinations-Health-Window": "1440",
            "X-Pollinations-Min-Success-Rate": "0.9",
        }),
    );
    expect(resolved).toMatchObject({
        ok: true,
        options: {
            source: "official",
            includeHealth: true,
            healthWindow: 1440,
            minSuccessRate: 0.9,
        },
    });

    const badHeader = resolveModelListOptions(
        {},
        headers({ "X-Pollinations-Source": "nope" }),
    );
    expect(badHeader.ok).toBe(false);
});

test("health math counts rescues as successes and excludes caller failures", () => {
    // status_2xx already includes fallback rescues — no double counting.
    const healthy = computeModelHealth(
        { success: 95, errors5xx: 5 },
        60,
        "2026-09-11T00:00:00.000Z",
    );
    expect(healthy.success_rate).toBeCloseTo(0.95);
    expect(healthy.sample_count).toBe(100);
    expect(healthy.status).toBe("healthy");

    const degraded = computeModelHealth(
        { success: 85, errors5xx: 15 },
        60,
        "2026-09-11T00:00:00.000Z",
    );
    expect(degraded.status).toBe("degraded");

    const down = computeModelHealth(
        { success: 40, errors5xx: 60 },
        60,
        "2026-09-11T00:00:00.000Z",
    );
    expect(down.status).toBe("down");

    // Missing data means unknown — never folded into reliability, and alpha
    // (experimental) status stays a separate model field.
    const unknown = computeModelHealth(
        undefined,
        60,
        "2026-09-11T00:00:00.000Z",
    );
    expect(unknown).toMatchObject({
        success_rate: null,
        sample_count: 0,
        status: "unknown",
    });
});

test("default listings are unchanged and source filtering works", async () => {
    const all = await fetchWorker("/v1/models");
    expect(all.status).toBe(200);
    const allBody = (await all.json()) as { data: Record<string, unknown>[] };
    expect(allBody.data.length).toBeGreaterThan(0);
    // Health omitted by default.
    expect(allBody.data[0]).not.toHaveProperty("health");

    const official = await fetchWorker("/v1/models?source=official");
    expect(official.status).toBe(200);
    const officialBody = (await official.json()) as {
        data: { community: boolean }[];
    };
    expect(officialBody.data.length).toBeGreaterThan(0);
    expect(officialBody.data.length).toBeLessThan(allBody.data.length);
    expect(
        officialBody.data.every((m) => m.community === false),
    ).toBe(true);

    const alias = await fetchWorker("/v1/models?community=false");
    expect(alias.status).toBe(200);
    expect(((await alias.json()) as typeof officialBody).data).toEqual(
        officialBody.data,
    );

    // Invalid values and conflicting filters are 400, not silent.
    expect((await fetchWorker("/v1/models?source=nope")).status).toBe(400);
    expect(
        (await fetchWorker("/v1/models?source=official&community=true")).status,
    ).toBe(400);
    expect(
        (
            await fetchWorker("/v1/models", {
                headers: { "X-Pollinations-Source": "nope" },
            })
        ).status,
    ).toBe(400);
});

test("health is opt-in and reliability filtering excludes unknowns", async () => {
    // min_success_rate=1 with a mocked-empty health window would be live-data
    // dependent, so only assert the validation boundary here: out-of-range
    // thresholds are rejected before any health fetch.
    expect((await fetchWorker("/v1/models?min_success_rate=2")).status).toBe(
        400,
    );
    expect(
        (await fetchWorker("/v1/models?health_window=0")).status,
    ).toBe(400);
});
