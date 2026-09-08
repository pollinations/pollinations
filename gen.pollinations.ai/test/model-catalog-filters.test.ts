import { SELF } from "cloudflare:test";
import { test } from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";
import {
    RELIABLE_MIN_SAMPLE,
    RELIABLE_SUCCESS_RATE,
    resetModelHealthCache,
    summariseModelHealth,
} from "../src/model-health.ts";
import {
    RELIABILITY_HEADER,
    resolveModelListFilters,
    SOURCE_HEADER,
} from "../src/schemas/models.ts";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

type Model = {
    name: string;
    community?: boolean;
    health?: Record<string, unknown>;
};

const row = (over: Partial<Record<string, number | string>> = {}) => ({
    model: "test/model",
    event_type: "generate.text",
    provider: "test",
    model_used: "test/model",
    total_requests: 100,
    status_2xx: 100,
    errors_4xx: 0,
    errors_5xx: 0,
    own_calls: 100,
    own_calls_ok: 100,
    primary_5xx: 0,
    primary_retried_503s: 0,
    fallback_rescues: 0,
    last_error_at: "",
    latency_p50_ms: 10,
    latency_p95_ms: 20,
    avg_latency_ms: 12,
    last_request_at: new Date().toISOString(),
    tokens_per_second: 5,
    ...over,
});

const summarise = (rows: ReturnType<typeof row>[]) =>
    summariseModelHealth(rows, {
        minutes: 60,
        timestamp: Date.now(),
        stale: false,
    });

// ----------------------------------------------------------- health maths ---

test("a fallback rescue counts as a success", () => {
    const health = summarise([
        row({
            total_requests: 100,
            status_2xx: 80,
            errors_5xx: 20,
            fallback_rescues: 20,
        }),
    ]).get("test/model");
    expect(health?.success_rate).toBe(1);
    expect(health?.status).toBe("reliable");
});

test("caller-side 4xx failures are excluded from the rate and the sample", () => {
    const health = summarise([
        row({ total_requests: 100, errors_4xx: 40, status_2xx: 60 }),
    ]).get("test/model");
    expect(health?.sample_size).toBe(60);
    expect(health?.success_rate).toBe(1);
});

test("rows are summed before a rate is taken, so a quiet provider cannot outvote a busy one", () => {
    const health = summarise([
        row({ provider: "a", total_requests: 1000, status_2xx: 1000 }),
        row({
            provider: "b",
            total_requests: 10,
            status_2xx: 0,
            errors_5xx: 10,
        }),
    ]).get("test/model");
    expect(health?.sample_size).toBe(1010);
    expect(health?.success_rate).toBeCloseTo(1000 / 1010, 4);
    expect(health?.status).toBe("reliable");
});

test("a high rate over too few requests is not called reliable", () => {
    const health = summarise([
        row({
            total_requests: RELIABLE_MIN_SAMPLE - 1,
            status_2xx: RELIABLE_MIN_SAMPLE - 1,
        }),
    ]).get("test/model");
    expect(health?.success_rate).toBe(1);
    expect(health?.sample_size).toBeLessThan(RELIABLE_MIN_SAMPLE);
    expect(health?.status).toBe("degraded");
});

test("a poor success rate is degraded however large the sample", () => {
    const health = summarise([
        row({ total_requests: 10_000, status_2xx: 5_000, errors_5xx: 5_000 }),
    ]).get("test/model");
    expect(health?.success_rate).toBeLessThan(RELIABLE_SUCCESS_RATE);
    expect(health?.status).toBe("degraded");
});

test("a model with no traffic in the window produces no summary at all", () => {
    expect(summarise([row({ total_requests: 0 })]).size).toBe(0);
});

// -------------------------------------------------------- filter resolver ---

const noHeaders = () => undefined;

test("filters default to everything, with no health payload", () => {
    expect(resolveModelListFilters({}, noHeaders)).toEqual({
        source: "all",
        reliability: "all",
        health: false,
    });
});

test("a header supplies filters for clients that can only set a base URL", () => {
    const headers = (name: string) =>
        ({ [SOURCE_HEADER]: "official", [RELIABILITY_HEADER]: "reliable" })[
            name
        ];
    expect(resolveModelListFilters({}, headers)).toEqual({
        source: "official",
        reliability: "reliable",
        health: true,
    });
});

test("an explicit query parameter beats a client-wide header default", () => {
    const headers = (name: string) =>
        name === SOURCE_HEADER ? "official" : undefined;
    expect(
        resolveModelListFilters({ source: "community" }, headers).source,
    ).toBe("community");
});

test("the deprecated community parameter still maps onto source", () => {
    expect(
        resolveModelListFilters({ community: "true" }, noHeaders).source,
    ).toBe("community");
    expect(resolveModelListFilters({ community: "0" }, noHeaders).source).toBe(
        "official",
    );
    // An explicit source wins over the deprecated alias.
    expect(
        resolveModelListFilters(
            { community: "true", source: "official" },
            noHeaders,
        ).source,
    ).toBe("official");
});

test("asking for reliable models implies showing why", () => {
    expect(
        resolveModelListFilters({ reliability: "reliable" }, noHeaders).health,
    ).toBe(true);
});

// ------------------------------------------------------------- catalogues ---

test("source=official and source=community partition the catalog", async () => {
    const all = (await (await fetchWorker("/models")).json()) as Model[];
    const official = (await (
        await fetchWorker("/models?source=official")
    ).json()) as Model[];
    const community = (await (
        await fetchWorker("/models?source=community")
    ).json()) as Model[];

    expect(all.length).toBeGreaterThan(0);
    expect(official.length + community.length).toBe(all.length);
    expect(official.every((m) => m.community !== true)).toBe(true);
    expect(community.every((m) => m.community === true)).toBe(true);
});

test("the source header filters the same way as the query parameter", async () => {
    const viaQuery = (await (
        await fetchWorker("/models?source=official")
    ).json()) as Model[];
    const viaHeader = (await (
        await fetchWorker("/models", {
            headers: { [SOURCE_HEADER]: "official" },
        })
    ).json()) as Model[];
    expect(viaHeader.map((m) => m.name)).toEqual(viaQuery.map((m) => m.name));
});

test("health=true attaches a summary to every model, unknown included", async () => {
    resetModelHealthCache();
    const models = (await (
        await fetchWorker("/models?health=true")
    ).json()) as Model[];
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
        expect(model.health).toBeDefined();
        expect(model.health).toHaveProperty("status");
        expect(model.health).toHaveProperty("success_rate");
        expect(model.health).toHaveProperty("sample_size");
        expect(model.health).toHaveProperty("window_minutes");
        expect(model.health).toHaveProperty("checked_at");
        expect(model.health).toHaveProperty("stale");
        expect(["reliable", "degraded", "unknown"]).toContain(
            model.health?.status,
        );
    }
});

test("health is omitted unless asked for, so the default payload is unchanged", async () => {
    const models = (await (await fetchWorker("/models")).json()) as Model[];
    expect(models.every((m) => m.health === undefined)).toBe(true);
});

test("reliability=reliable never returns a model of unknown health", async () => {
    resetModelHealthCache();
    const models = (await (
        await fetchWorker("/models?reliability=reliable")
    ).json()) as Model[];
    expect(models.every((m) => m.health?.status === "reliable")).toBe(true);
});

test("filtering discovery does not change what the account may generate with", async () => {
    // The filtered list must always be a subset of the unfiltered one: these
    // parameters hide models from a listing, they never reveal new ones.
    const all = (await (await fetchWorker("/models")).json()) as Model[];
    const names = new Set(all.map((m) => m.name));
    for (const query of [
        "?source=official",
        "?source=community",
        "?reliability=reliable",
    ]) {
        const filtered = (await (
            await fetchWorker(`/models${query}`)
        ).json()) as Model[];
        expect(filtered.every((m) => names.has(m.name))).toBe(true);
    }
});

test("the OpenAI-compatible list takes the same filters", async () => {
    const body = (await (
        await fetchWorker("/v1/models?source=official&health=true")
    ).json()) as { object: string; data: Model[] };
    expect(body.object).toBe("list");
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((m) => m.community !== true)).toBe(true);
    expect(body.data.every((m) => m.health !== undefined)).toBe(true);
});

test("category catalogs take the filters too", async () => {
    for (const path of ["/image/models", "/text/models", "/audio/models"]) {
        const models = (await (
            await fetchWorker(`${path}?source=official`)
        ).json()) as Model[];
        expect(Array.isArray(models)).toBe(true);
        expect(models.every((m) => m.community !== true)).toBe(true);
    }
});

test("an unknown filter value is rejected rather than silently ignored", async () => {
    for (const query of ["?source=nonsense", "?reliability=perfect"]) {
        const response = await fetchWorker(`/models${query}`);
        expect(response.status).toBe(400);
    }
});
