import { SELF } from "cloudflare:test";
import {
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";
import { resetModelHealthCacheForTest } from "../src/routes/model-status.ts";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

// Builds a valid model_health pipe row with only the fields the catalog
// health read uses; the rest take plausible zero/empty values.
function healthRow(
    model: string,
    counts: { ok: number; fail: number },
): Record<string, unknown> {
    return {
        model,
        event_type: "generate.text",
        provider: "test-provider",
        model_used: model,
        total_requests: counts.ok + counts.fail,
        status_2xx: counts.ok,
        errors_4xx: 0,
        errors_5xx: counts.fail,
        own_calls: counts.ok + counts.fail,
        own_calls_ok: counts.ok,
        primary_5xx: counts.fail,
        primary_retried_503s: 0,
        fallback_rescues: 0,
        last_error_at: "",
        latency_p50_ms: null,
        latency_p95_ms: null,
        avg_latency_ms: null,
        last_request_at: "",
        tokens_per_second: null,
    };
}

test("retrieves a model by canonical ID", async () => {
    const response = await fetchWorker(
        `/v1/models/${encodeURIComponent("openai/gpt-5-nano")}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.id).toBe("openai/gpt-5-nano");
    expect(body.object).toBe("model");
    expect(typeof body.created).toBe("number");
    // Stable registry metadata, not the request wall clock
    expect(body.created as number).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000),
    );
    expect(typeof body.owned_by).toBe("string");
    expect(body).toMatchObject({
        aliases: expect.any(Array),
        category: "text",
        community: false,
        title: expect.any(String),
    });
});

test("retrieves a publisher-qualified canonical ID", async ({ paidApiKey }) => {
    const model = "z-ai/glm-5.3-flash";
    const response = await fetchWorker(
        `/v1/models/${encodeURIComponent(model)}`,
        {
            headers: { Authorization: `Bearer ${paidApiKey}` },
        },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string };
    expect(body.id).toBe(model);
});

test("resolves an alias to the canonical ID with identical metadata", async () => {
    const byAlias = await fetchWorker("/v1/models/gpt-5-nano");
    expect(byAlias.status).toBe(200);
    const aliasBody = (await byAlias.json()) as {
        id: string;
        created: number;
    };
    expect(aliasBody.id).toBe("openai/gpt-5-nano");

    const byId = await fetchWorker(
        `/v1/models/${encodeURIComponent("openai/gpt-5-nano")}`,
    );
    const idBody = (await byId.json()) as { created: number };
    expect(aliasBody.created).toBe(idBody.created);
});

test("retrieve matches the list entry exactly (shared mapper)", async () => {
    const listResponse = await fetchWorker("/v1/models");
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as {
        data: Record<string, unknown>[];
    };
    const listed = list.data.find((m) => m.id === "openai/gpt-5-nano");
    expect(listed).toBeDefined();

    const retrieveResponse = await fetchWorker(
        `/v1/models/${encodeURIComponent("openai/gpt-5-nano")}`,
    );
    const retrieved = (await retrieveResponse.json()) as Record<
        string,
        unknown
    >;
    expect(retrieved).toEqual(listed);
});

test("advertises direct Responses support through supported_endpoints", async () => {
    const supported = await fetchWorker("/v1/models/qwen-large");
    expect(supported.status).toBe(200);
    await expect(supported.json()).resolves.toMatchObject({
        supported_endpoints: expect.arrayContaining(["/v1/responses"]),
    });

    const unsupported = await fetchWorker("/v1/models/claude");
    expect(unsupported.status).toBe(200);
    const unsupportedBody = (await unsupported.json()) as {
        supported_endpoints?: string[];
    };
    expect(unsupportedBody.supported_endpoints).not.toContain("/v1/responses");
});

test("returns 404 for an unknown model", async () => {
    const response = await fetchWorker("/v1/models/does-not-exist-xyz");
    expect(response.status).toBe(404);
});

test("returns 404 when API key permissions exclude the model", async ({
    restrictedApiKey,
}) => {
    const excluded = await fetchWorker("/v1/models/krea", {
        headers: { Authorization: `Bearer ${restrictedApiKey}` },
    });
    expect(excluded.status).toBe(404);

    const allowed = await fetchWorker(
        `/v1/models/${encodeURIComponent(RESTRICTED_TEXT_TEST_MODEL)}`,
        {
            headers: { Authorization: `Bearer ${restrictedApiKey}` },
        },
    );
    expect(allowed.status).toBe(200);
});

test("hides paid-only models from callers without paid balance", async ({
    apiKey,
    paidApiKey,
}) => {
    const withoutBalance = await fetchWorker("/v1/models/krea", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(withoutBalance.status).toBe(404);

    const withBalance = await fetchWorker("/v1/models/krea", {
        headers: { Authorization: `Bearer ${paidApiKey}` },
    });
    expect(withBalance.status).toBe(200);
    const body = (await withBalance.json()) as { id: string };
    expect(body.id).toBe("krea/krea-2-medium");
});

test("shows Grok 4.6 to callers without paid balance", async ({ apiKey }) => {
    const response = await fetchWorker("/v1/models/grok-4.6", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string };
    expect(body.id).toBe("x-ai/grok-4.6");
});

test("applies the same 404 rule to aliases of hidden models", async ({
    apiKey,
}) => {
    const response = await fetchWorker("/v1/models/krea-2", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(response.status).toBe(404);
});

test("rejects invalid source and reliability values", async () => {
    for (const query of [
        "?source=true",
        "?source=official&reliability=unreliable",
    ]) {
        const response = await fetchWorker(`/models${query}`);
        expect(response.status).toBe(400);
    }

    expect(
        (
            await fetchWorker("/models", {
                headers: { "Pollinations-Model-Source": "invalid" },
            })
        ).status,
    ).toBe(400);
});

test("filters the model list by source", async () => {
    const all = (await (await fetchWorker("/models")).json()) as {
        community?: boolean;
        name: string;
    }[];
    const official = (await (
        await fetchWorker("/models?source=official")
    ).json()) as { community?: boolean; name: string }[];
    const community = (await (
        await fetchWorker("/models?source=community")
    ).json()) as { community?: boolean; name: string }[];

    expect(official.every((m) => !m.community)).toBe(true);
    expect(community.every((m) => m.community)).toBe(true);
    expect(official.length + community.length).toBe(all.length);

    const officialByHeader = (await (
        await fetchWorker("/models", {
            headers: { "Pollinations-Model-Source": "official" },
        })
    ).json()) as { community?: boolean }[];
    expect(officialByHeader.every((m) => !m.community)).toBe(true);

    const conflicting = await fetchWorker("/models?source=community", {
        headers: { "Pollinations-Model-Source": "official" },
    });
    expect(conflicting.status).toBe(400);
});

test("reliability filtering keeps unmeasured models and excludes the unavailable", async ({
    bypassHealthCache,
}) => {
    await resetModelHealthCacheForTest();
    await bypassHealthCache({
        data: [
            healthRow("openai/gpt-5-nano", { ok: 50, fail: 0 }),
            healthRow("openai/gpt-5.4-nano", { ok: 50, fail: 50 }),
        ],
    });

    const all = (await (await fetchWorker("/models")).json()) as {
        name: string;
    }[];
    // GPT-5 Nano: healthy; GPT-5.4 Nano: 50% failures => unavailable;
    // everything else: no health row => unknown, kept.
    expect(all.some((m) => m.name === "openai/gpt-5.4-nano")).toBe(true);

    const reliable = (await (
        await fetchWorker("/models?reliability=reliable")
    ).json()) as { name: string }[];
    expect(reliable.some((m) => m.name === "openai/gpt-5-nano")).toBe(true);
    expect(reliable.some((m) => m.name === "openai/gpt-5.4-nano")).toBe(false);

    const reliableByHeader = (await (
        await fetchWorker("/models", {
            headers: { "Pollinations-Model-Reliability": "reliable" },
        })
    ).json()) as { name: string }[];
    expect(reliableByHeader).toEqual(reliable);
    // Unmeasured models stay: missing data means unknown, not unreliable.
    const unmeasured = all.filter(
        (m) => !["openai/gpt-5.4-nano", "openai/gpt-5-nano"].includes(m.name),
    );
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const model of unmeasured) {
        expect(reliable.some((m) => m.name === model.name)).toBe(true);
    }
});

test("exposes health metadata consistently across list, retrieve, and /models", async ({
    bypassHealthCache,
}) => {
    await resetModelHealthCacheForTest();
    await bypassHealthCache({
        data: [healthRow("openai/gpt-5-nano", { ok: 100, fail: 1 })],
    });

    const listed = (
        (await (await fetchWorker("/v1/models")).json()) as {
            data: { id: string; health?: unknown }[];
        }
    ).data.find((m) => m.id === "openai/gpt-5-nano");
    expect(listed?.health).toBeDefined();

    const retrieved = (await (
        await fetchWorker(
            `/v1/models/${encodeURIComponent("openai/gpt-5-nano")}`,
        )
    ).json()) as { health?: unknown };
    expect(retrieved.health).toEqual(listed?.health);

    const rich = (
        (await (await fetchWorker("/models")).json()) as {
            name: string;
            health?: unknown;
        }[]
    ).find((m) => m.name === "openai/gpt-5-nano");
    expect(rich?.health).toEqual(listed?.health);
});

test("health fields describe status, sample, window, and freshness", async ({
    bypassHealthCache,
}) => {
    await resetModelHealthCacheForTest();
    await bypassHealthCache({
        data: [healthRow("openai/gpt-5-nano", { ok: 100, fail: 1 })],
    });

    const model = (
        (await (await fetchWorker("/models")).json()) as {
            name: string;
            health?: Record<string, unknown>;
        }[]
    ).find((m) => m.name === "openai/gpt-5-nano");
    const health = model?.health;
    expect(health).toBeDefined();
    expect(health?.status).toBe("healthy"); // 100/101 success, >= MIN_SAMPLE
    expect(health?.success_rate).toBeCloseTo(100 / 101, 5);
    expect(health?.sample_size).toBe(101);
    expect(health?.window_minutes).toBe(1440);
    expect(typeof health?.checked_at).toBe("string");
    expect(health?.stale).toBe(false);
});

test("marks a small sample as unknown, not healthy", async ({
    bypassHealthCache,
}) => {
    await resetModelHealthCacheForTest();
    await bypassHealthCache({
        data: [healthRow("openai/gpt-5-nano", { ok: 1, fail: 0 })],
    });

    const model = (
        (await (await fetchWorker("/models")).json()) as {
            name: string;
            health?: Record<string, unknown>;
        }[]
    ).find((m) => m.name === "openai/gpt-5-nano");
    expect(model?.health?.status).toBe("unknown");
});

test("serves model listings with health when the monitoring source is down", async ({
    bypassHealthCache,
}) => {
    await resetModelHealthCacheForTest();
    await bypassHealthCache(null);

    const response = await fetchWorker("/models?reliability=reliable");
    expect(response.status).toBe(200);
    const models = (await response.json()) as { name: string }[];
    expect(models.length).toBeGreaterThan(0);
});

test("degraded status survives reliability filtering, unavailable does not", async ({
    bypassHealthCache,
}) => {
    await resetModelHealthCacheForTest();
    await bypassHealthCache({
        data: [
            healthRow("openai/gpt-5-nano", { ok: 95, fail: 5 }), // 5% => degraded
            healthRow("openai/gpt-5.4-nano", { ok: 50, fail: 50 }), // 50% => unavailable
        ],
    });
    const reliable = (await (
        await fetchWorker("/models?reliability=reliable")
    ).json()) as { name: string }[];
    expect(reliable.some((m) => m.name === "openai/gpt-5-nano")).toBe(true);
    expect(reliable.some((m) => m.name === "openai/gpt-5.4-nano")).toBe(false);
});
