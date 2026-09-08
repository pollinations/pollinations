import { SELF } from "cloudflare:test";
import {
    test as baseTest,
    RESTRICTED_IMAGE_TEST_MODEL,
    RESTRICTED_TEXT_TEST_MODEL,
} from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import {
    createMockTinybird,
    type MockTinybirdState,
} from "@shared/test/mocks/tinybird.ts";
import { afterEach, beforeEach, expect } from "vitest";
import { resetGenerationModelRegistryCache } from "../src/model-registry.ts";
import { resetModelHealthCache } from "../src/routes/model-status.ts";

const GPT5_NANO = "openai/gpt-5-nano";
const CLAUDE_HAIKU = "anthropic/claude-haiku-4.5";
const KREA = "krea/krea-2-medium";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

type OpenAIModelList = {
    data: Array<Record<string, unknown> & { id: string; community: boolean }>;
};

type HealthRow = Record<string, unknown>;

function healthRow(
    model: string,
    status_2xx: number,
    errors_5xx: number,
    over: Partial<HealthRow> = {},
): HealthRow {
    return {
        model,
        event_type: "generate.text",
        provider: "test-provider",
        model_used: model,
        total_requests: status_2xx + errors_5xx,
        status_2xx,
        errors_4xx: 0,
        errors_5xx,
        own_calls: status_2xx + errors_5xx,
        own_calls_ok: status_2xx,
        primary_5xx: errors_5xx,
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

// Installs a mock Tinybird backend for the worker's model_health pipe. The
// registry is rebuilt on cache expiry, so tests must reset the registry and
// health caches before configuring distinct health rows.
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

async function resetCaches() {
    resetGenerationModelRegistryCache();
    resetModelHealthCache();
}

const MIXED_HEALTH_ROWS = [
    healthRow(GPT5_NANO, 1000, 0),
    healthRow(CLAUDE_HAIKU, 950, 50),
    healthRow(KREA, 500, 500),
];

beforeEach(() => {
    resetCaches();
});

afterEach(() => {
    resetCaches();
});

test("source=official returns only official models", async ({ tinybird }) => {
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    const response = await fetchWorker("/v1/models?source=official");
    expect(response.status).toBe(200);
    const data = (await response.json()) as OpenAIModelList;
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data.every((m) => m.community === false)).toBe(true);
});

test("source=community is a community-only subset of the default list", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    const [all, community] = await Promise.all([
        fetchWorker("/v1/models"),
        fetchWorker("/v1/models?source=community"),
    ]);
    expect(all.status).toBe(200);
    expect(community.status).toBe(200);

    const allData = (await all.json()) as OpenAIModelList;
    const communityData = (await community.json()) as OpenAIModelList;
    const allIds = new Set(allData.data.map((m) => m.id));
    for (const model of communityData.data) {
        expect(model.community).toBe(true);
        expect(allIds.has(model.id)).toBe(true);
    }
});

test("legacy community query parameter stays supported", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    const [officialNumeric, officialWord] = await Promise.all([
        fetchWorker("/models?community=0"),
        fetchWorker("/v1/models?community=false"),
    ]);
    const [communityNumeric, communityWord] = await Promise.all([
        fetchWorker("/models?community=1"),
        fetchWorker("/v1/models?community=true"),
    ]);

    expect(officialNumeric.status).toBe(200);
    expect(officialWord.status).toBe(200);
    expect(communityNumeric.status).toBe(200);
    expect(communityWord.status).toBe(200);

    const officialNumericData = (await officialNumeric.json()) as Array<
        Record<string, unknown> & { community?: boolean }
    >;
    const officialWordData = (await officialWord.json()) as OpenAIModelList;
    const communityNumericData = (await communityNumeric.json()) as Array<
        Record<string, unknown> & { community?: boolean }
    >;
    const communityWordData = (await communityWord.json()) as OpenAIModelList;

    expect(officialNumericData.every((m) => m.community === false)).toBe(true);
    expect(officialWordData.data.every((m) => m.community === false)).toBe(
        true,
    );
    expect(communityNumericData.every((m) => m.community === true)).toBe(true);
    expect(communityWordData.data.every((m) => m.community === true)).toBe(
        true,
    );
});

test("reliable=true keeps only models with healthy status", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    const reliable = await fetchWorker("/v1/models?reliable=true");
    expect(reliable.status).toBe(200);
    const data = (await reliable.json()) as OpenAIModelList;
    // GPT 5 Nano is the only healthy model; claude is degraded, krea is
    // unavailable, and every model without a row is unknown.
    expect(data.data.map((m) => m.id)).toEqual([GPT5_NANO]);

    // Unfiltered (default) responses still list every model with health.
    const unfiltered = await fetchWorker("/v1/models");
    const unfilteredData = (await unfiltered.json()) as OpenAIModelList;
    const ids = new Set(unfilteredData.data.map((m) => m.id));
    for (const id of [GPT5_NANO, CLAUDE_HAIKU, KREA]) {
        expect(ids.has(id)).toBe(true);
    }
    expect(unfilteredData.data[0]).not.toHaveProperty("source");
});

test("reliable=false and reliable=0 keep every model", async ({ tinybird }) => {
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    const [falseFilter, zeroFilter] = await Promise.all([
        fetchWorker("/v1/models?reliable=false"),
        fetchWorker("/v1/models?reliable=0"),
    ]);
    const falseData = (await falseFilter.json()) as OpenAIModelList;
    const zeroData = (await zeroFilter.json()) as OpenAIModelList;
    expect(falseData.data.length).toBeGreaterThan(1);
    expect(zeroData.data.length).toBe(falseData.data.length);
});

test("healthy status drives reliable on detailed and text endpoints", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    const [detailed, text] = await Promise.all([
        fetchWorker("/models?reliable=true"),
        fetchWorker("/text/models?reliable=true"),
    ]);

    expect(detailed.status).toBe(200);
    expect(text.status).toBe(200);

    const detailedData = (await detailed.json()) as Array<
        Record<string, unknown> & { name: string }
    >;
    const textData = (await text.json()) as Array<
        Record<string, unknown> & { name: string }
    >;
    expect(detailedData.map((m) => m.name)).toEqual([GPT5_NANO]);
    expect(textData.map((m) => m.name)).toEqual([GPT5_NANO]);
});

test("filter header replaces query parameters for base-URL clients", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    const headerSource = await fetchWorker("/v1/models", {
        headers: { "X-Pollinations-Model-Filter": "source=official" },
    });
    expect(headerSource.status).toBe(200);
    const sourceData = (await headerSource.json()) as OpenAIModelList;
    expect(sourceData.data.every((m) => m.community === false)).toBe(true);

    const headerReliable = await fetchWorker("/v1/models", {
        headers: { "X-Pollinations-Model-Filter": "reliable=true" },
    });
    expect(headerReliable.status).toBe(200);
    const reliableData = (await headerReliable.json()) as OpenAIModelList;
    expect(reliableData.data.map((m) => m.id)).toEqual([GPT5_NANO]);
});

test("explicit query parameters override filter header values", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    const response = await fetchWorker("/v1/models?source=official", {
        headers: {
            "X-Pollinations-Model-Filter": "source=community&reliable=true",
        },
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as OpenAIModelList;
    // query source=official wins over the header's community source.
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data.every((m) => m.community === false)).toBe(true);
    // The header's reliable=true still applies (it was not overridden).
    expect(data.data.map((m) => m.id)).toEqual([GPT5_NANO]);
});

test("rejects malformed and conflicting discovery filters", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    const badValues = await Promise.all([
        fetchWorker("/models?source=bogus"),
        fetchWorker("/models?reliable=2"),
        fetchWorker("/v1/models?source=official&community=true"),
        fetchWorker("/v1/models?source=community&community=false"),
        fetchWorker("/v1/models", {
            headers: { "X-Pollinations-Model-Filter": "source=bogus" },
        }),
        fetchWorker("/v1/models", {
            headers: {
                "X-Pollinations-Model-Filter": "source=official&community=true",
            },
        }),
        fetchWorker("/v1/models", {
            headers: { "X-Pollinations-Model-Filter": "not=valid" },
        }),
    ]);
    for (const response of badValues) {
        expect(response.status).toBe(400);
    }
});

test("permission filtering applies before discovery filters", async ({
    restrictedApiKey,
    tinybird,
}) => {
    // Krea is healthy per the mock but not in the restricted key's allowlist.
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    const authHeaders = { Authorization: `Bearer ${restrictedApiKey}` };
    const base = (
        await fetchWorker("/v1/models", {
            headers: authHeaders,
        })
    ).json() as Promise<OpenAIModelList>;
    const baseIds = new Set((await base).data.map((m) => m.id));
    expect(baseIds.has(KREA)).toBe(false);

    const filtered = (
        await fetchWorker("/v1/models?reliable=true", {
            headers: authHeaders,
        })
    ).json() as Promise<OpenAIModelList>;
    const filteredIds = new Set((await filtered).data.map((m) => m.id));
    for (const id of filteredIds) {
        expect(baseIds.has(id)).toBe(true);
        expect(
            id === RESTRICTED_TEXT_TEST_MODEL ||
                id === RESTRICTED_IMAGE_TEST_MODEL,
        ).toBe(true);
    }
    expect(filteredIds.has(KREA)).toBe(false);
});

test("paid-balance filtering applies before discovery filters", async ({
    apiKey,
    paidApiKey,
    tinybird,
}) => {
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    const withoutBalance = (
        await fetchWorker("/v1/models?source=official", {
            headers: { Authorization: `Bearer ${apiKey}` },
        })
    ).json() as Promise<OpenAIModelList>;
    const withBalance = (
        await fetchWorker("/v1/models?source=official", {
            headers: { Authorization: `Bearer ${paidApiKey}` },
        })
    ).json() as Promise<OpenAIModelList>;

    const withoutIds = (await withoutBalance).data.map((m) => m.id);
    const withIds = (await withBalance).data.map((m) => m.id);
    // krea is paid-only: absent without paid balance even though it is
    // official and therefore passes the source filter.
    expect(withoutIds).not.toContain(KREA);
    expect(withIds).toContain(KREA);
});

test("retrieve endpoints ignore discovery filters and stay reachable", async ({
    tinybird,
}) => {
    tinybird.modelHealthResponse = MIXED_HEALTH_ROWS;
    resetCaches();

    // A non-healthy model is hidden from reliable listings but still
    // retrievable by id, exactly like community filtering today.
    const response = await fetchWorker(
        `/v1/models/${encodeURIComponent(CLAUDE_HAIKU)}?reliable=true`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string };
    expect(body.id).toBe(CLAUDE_HAIKU);
});
