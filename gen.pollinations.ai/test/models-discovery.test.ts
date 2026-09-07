import { SELF } from "cloudflare:test";
import { test as baseTest } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import {
    createMockTinybird,
    type MockTinybirdState,
} from "@shared/test/mocks/tinybird.ts";
import { beforeEach, expect } from "vitest";
import { clearModelHealthCacheForTests } from "../src/routes/model-status.ts";

const GPT5_NANO = "openai/gpt-5-nano";
const FLUX_SCHNELL = "black-forest-labs/flux.1-schnell";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

type HealthRow = Record<string, unknown>;

function healthRow(model: string, over: Partial<HealthRow> = {}): HealthRow {
    return {
        model,
        event_type: "generate.text",
        provider: "test-provider",
        model_used: "test-upstream",
        total_requests: 0,
        status_2xx: 0,
        errors_4xx: 0,
        errors_5xx: 0,
        own_calls: 0,
        own_calls_ok: 0,
        primary_5xx: 0,
        primary_retried_503s: 0,
        fallback_rescues: 0,
        last_error_at: "",
        latency_p50_ms: 100,
        latency_p95_ms: 200,
        avg_latency_ms: 120,
        last_request_at: "2026-09-07T00:00:00Z",
        tokens_per_second: null,
        ...over,
    };
}

const test = baseTest.extend<{ tinybird: MockTinybirdState }>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern
    tinybird: async ({}, use) => {
        const mock = createMockTinybird();
        const fetchMock = createFetchMock({ tinybird: mock });
        await fetchMock.enable("tinybird");
        await use(mock.state);
        await teardownFetchMock();
    },
});

beforeEach(() => {
    clearModelHealthCacheForTests();
});

test("list endpoints attach minimal health metadata with rescue and caller-error semantics", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = [
        // 97/100 final 2xx; 5 of those successes were fallback rescues.
        healthRow(GPT5_NANO, {
            total_requests: 100,
            status_2xx: 97,
            errors_5xx: 3,
            fallback_rescues: 5,
            own_calls: 90,
            own_calls_ok: 85,
        }),
        // 9 successes out of 10 finals, 1 caller-side 4xx excluded from the
        // denominator: success rate is 9/9 = 1.0, not 0.9.
        healthRow(FLUX_SCHNELL, {
            total_requests: 10,
            status_2xx: 9,
            errors_4xx: 1,
            event_type: "generate.image",
        }),
    ];

    const response = await fetchWorker("/v1/models");
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
        data: Array<
            Record<string, unknown> & {
                id: string;
                health?: {
                    success_rate?: number;
                    samples?: number;
                    window_minutes?: number;
                    observed_at?: string;
                };
            }
        >;
    };

    const healthy = data.find((m) => m.id === GPT5_NANO);
    expect(healthy?.health).toMatchObject({
        success_rate: 0.97,
        samples: 100,
        window_minutes: 60,
    });
    expect(
        typeof healthy?.health?.observed_at === "string" &&
            !Number.isNaN(Date.parse(healthy.health.observed_at)),
    ).toBe(true);

    const rescued = data.find((m) => m.id === FLUX_SCHNELL);
    expect(rescued?.health?.success_rate).toBe(1);

    // Models without health rows are unknown: no field at all.
    const noRow = data.filter(
        (m) => m.id !== GPT5_NANO && m.id !== FLUX_SCHNELL,
    );
    expect(noRow.length).toBeGreaterThan(0);
    for (const model of noRow) {
        expect(model.health).toBeUndefined();
    }
});

test("reliable=true keeps only sufficiently healthy models and treats unknown as unreliable", async ({
    tinybird,
}) => {
    const all = (await (await fetchWorker("/v1/models")).json()) as {
        data: Array<{ id: string; community: boolean }>;
    };
    const third = all.data.find(
        (m) => !m.community && m.id !== GPT5_NANO && m.id !== FLUX_SCHNELL,
    );
    expect(third).toBeDefined();

    tinybird.modelHealthResponse = [
        healthRow(GPT5_NANO, {
            total_requests: 100,
            status_2xx: 97,
            errors_5xx: 3,
        }),
        healthRow(FLUX_SCHNELL, {
            total_requests: 20,
            status_2xx: 5,
            errors_5xx: 15,
            event_type: "generate.image",
        }),
    ];

    // The first fetch above already cached an empty health snapshot; drop it
    // so the freshly configured Tinybird rows are picked up.
    clearModelHealthCacheForTests();

    const reliable = (await (
        await fetchWorker("/v1/models?reliable=true")
    ).json()) as { data: Array<{ id: string }> };
    const ids = reliable.data.map((m) => m.id);
    expect(ids).toContain(GPT5_NANO);
    expect(ids).not.toContain(FLUX_SCHNELL);
    expect(ids).not.toContain(third?.id);

    // Without the filter every model is still listed.
    const unfiltered = (await (await fetchWorker("/v1/models")).json()) as {
        data: Array<{ id: string }>;
    };
    const unfilteredIds = unfiltered.data.map((m) => m.id);
    expect(unfilteredIds).toContain(GPT5_NANO);
    expect(unfilteredIds).toContain(FLUX_SCHNELL);
    expect(unfilteredIds).toContain(third?.id);
});

test("source filter partitions listings without changing default output", async () => {
    const all = (await (await fetchWorker("/v1/models")).json()) as {
        data: Array<{ community: boolean }>;
    };
    const official = (await (
        await fetchWorker("/v1/models?source=official")
    ).json()) as { data: Array<{ community: boolean }> };
    const community = (await (
        await fetchWorker("/v1/models?source=community")
    ).json()) as { data: Array<{ community: boolean }> };

    for (const model of official.data) expect(model.community).toBe(false);
    for (const model of community.data) expect(model.community).toBe(true);
    expect(official.data.length + community.data.length).toBe(all.data.length);
});

test("filter header works for clients that append /models to a base URL", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = [
        healthRow(GPT5_NANO, {
            total_requests: 100,
            status_2xx: 97,
            errors_5xx: 3,
        }),
    ];

    const viaHeader = (await (
        await fetchWorker("/v1/models", {
            headers: { "X-Pollinations-Model-Filter": "source=official" },
        })
    ).json()) as { data: Array<{ community: boolean }> };
    for (const model of viaHeader.data) expect(model.community).toBe(false);

    // Explicit query parameters win over header values.
    const queryWins = (await (
        await fetchWorker("/v1/models?source=community", {
            headers: { "X-Pollinations-Model-Filter": "source=official" },
        })
    ).json()) as { data: Array<{ community: boolean }> };
    for (const model of queryWins.data) expect(model.community).toBe(true);

    // Reliable filter through the header alone.
    const reliableViaHeader = (await (
        await fetchWorker("/v1/models", {
            headers: {
                "X-Pollinations-Model-Filter": "source=official&reliable=true",
            },
        })
    ).json()) as { data: Array<{ id: string; health?: unknown }> };
    expect(reliableViaHeader.data.map((m) => m.id)).toContain(GPT5_NANO);
    for (const model of reliableViaHeader.data) {
        expect(model.health).toBeDefined();
    }

    const badHeader = await fetchWorker("/v1/models", {
        headers: { "X-Pollinations-Model-Filter": "source=bogus" },
    });
    expect(badHeader.status).toBe(400);
});

test("detailed /models endpoint carries the same health metadata", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = [
        healthRow(GPT5_NANO, {
            total_requests: 100,
            status_2xx: 97,
            errors_5xx: 3,
        }),
    ];

    const response = await fetchWorker("/models");
    expect(response.status).toBe(200);
    const models = (await response.json()) as Array<{
        name: string;
        health?: { success_rate: number; samples: number };
    }>;
    const target = models.find((m) => m.name === GPT5_NANO);
    expect(target?.health?.success_rate).toBe(0.97);
    expect(target?.health?.samples).toBe(100);
});

test("retrieve keeps unhealthy models reachable and exposes their health", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = [
        healthRow(GPT5_NANO, {
            total_requests: 100,
            status_2xx: 97,
            errors_5xx: 3,
        }),
        healthRow(FLUX_SCHNELL, {
            total_requests: 20,
            status_2xx: 5,
            errors_5xx: 15,
            event_type: "generate.image",
        }),
    ];

    // Discovery filtering must not change generation-side access rules: an
    // unreliable model is hidden from ?reliable=true but still retrievable.
    const retrieved = await fetchWorker(
        `/v1/models/${encodeURIComponent(FLUX_SCHNELL)}`,
    );
    expect(retrieved.status).toBe(200);
    const body = (await retrieved.json()) as {
        id: string;
        health?: { success_rate: number };
    };
    expect(body.id).toBe(FLUX_SCHNELL);
    expect(body.health?.success_rate).toBe(0.25);

    const healthyRetrieved = await fetchWorker(
        `/v1/models/${encodeURIComponent(GPT5_NANO)}`,
    );
    expect(healthyRetrieved.status).toBe(200);
});

test("/v1/models/status raw endpoint is unchanged", async ({ tinybird }) => {
    tinybird.modelHealthResponse = [
        healthRow(GPT5_NANO, { total_requests: 4, status_2xx: 4 }),
    ];

    const response = await fetchWorker("/v1/models/status");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Array<{ model: string }> };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].model).toBe(GPT5_NANO);
});
