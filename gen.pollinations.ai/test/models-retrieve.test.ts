import {
    createExecutionContext,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { modelHealthFromCounts } from "@shared/registry/model-health.ts";
import {
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { afterEach, expect, vi } from "vitest";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

async function fetchWorkerWithMock(path: string, init: RequestInit = {}) {
    const { default: worker } = await import("../src/index.ts");
    const context = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        { ENVIRONMENT: "test" } as CloudflareBindings,
        context,
    );
    await waitOnExecutionContext(context);
    return response;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
});

function healthRow(model: string, status_2xx: number, errors_5xx: number) {
    return {
        model,
        event_type: "generate.text",
        provider: "test",
        model_used: model,
        total_requests: status_2xx + errors_5xx + 50,
        status_2xx,
        errors_4xx: 50,
        errors_5xx,
        own_calls: status_2xx + errors_5xx,
        own_calls_ok: status_2xx,
        primary_5xx: errors_5xx,
        primary_retried_503s: 0,
        fallback_rescues: 2,
        last_error_at: "1970-01-01 00:00:00",
        latency_p50_ms: null,
        latency_p95_ms: null,
        avg_latency_ms: null,
        last_request_at: "1970-01-01 00:00:00",
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

test("adds measured health and filters healthy models on demand", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({
            data: [
                healthRow("openai/gpt-5-nano", 98, 2),
                healthRow("anthropic/claude-haiku-4.5", 8, 2),
            ],
        }),
    );

    const unfiltered = await fetchWorkerWithMock("/v1/models");
    const unfilteredBody = (await unfiltered.json()) as {
        data: { id: string; health?: unknown }[];
    };
    expect(unfilteredBody.data[0]).not.toHaveProperty("health");
    expect(fetchSpy).not.toHaveBeenCalled();

    const withHealth = await fetchWorkerWithMock("/v1/models?status=all");
    const withHealthBody = (await withHealth.json()) as {
        data: {
            id: string;
            health: Record<string, unknown>;
        }[];
    };
    expect(
        withHealthBody.data.find((model) => model.id === "openai/gpt-5-nano")
            ?.health,
    ).toMatchObject({
        status: "healthy",
        success_rate: 0.98,
        sample_size: 100,
        window_minutes: 1440,
        stale: false,
    });
    expect(
        withHealthBody.data.find(
            (model) => model.id === "anthropic/claude-haiku-4.5",
        )?.health,
    ).toMatchObject({ status: "down", sample_size: 10 });
    expect(
        withHealthBody.data.find(
            (model) => model.id === "mistralai/mistral-small-4",
        )?.health,
    ).toMatchObject({ status: "unknown", sample_size: 0 });

    const healthy = await fetchWorkerWithMock("/v1/models?status=healthy");
    const healthyBody = (await healthy.json()) as {
        data: { id: string }[];
    };
    expect(healthyBody.data.map(({ id }) => id)).toEqual(["openai/gpt-5-nano"]);
});

test("accepts client-safe model filter headers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({ data: [healthRow("openai/gpt-5-nano", 10, 0)] }),
    );
    const response = await fetchWorkerWithMock("/text/models", {
        headers: {
            "Pollinations-Model-Source": "official",
            "Pollinations-Model-Status": "healthy",
        },
    });

    expect(response.status).toBe(200);
    const models = (await response.json()) as {
        name: string;
        community: boolean;
        health: { status: string };
    }[];
    expect(models.map(({ name }) => name)).toEqual(["openai/gpt-5-nano"]);
    expect(models[0]).toMatchObject({
        community: false,
        health: { status: "healthy" },
    });
});

test("reports unknown health when monitoring is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    const response = await fetchWorkerWithMock("/v1/models?status=all");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        data: { health: Record<string, unknown> }[];
    };
    expect(body.data[0]?.health).toMatchObject({
        status: "unknown",
        success_rate: null,
        sample_size: 0,
        checked_at: null,
        stale: true,
    });
});

test("rejects invalid discovery filters", async () => {
    const responses = await Promise.all([
        fetchWorker("/models?source=other"),
        fetchWorker("/models?status=other"),
        fetchWorker("/models", {
            headers: { "Pollinations-Model-Source": "other" },
        }),
    ]);

    expect(responses.every(({ status }) => status === 400)).toBe(true);
});

test("applies compact health consistently across every catalog", async () => {
    const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(Response.json({ data: [] }));
    for (const path of [
        "/models",
        "/v1/models",
        "/text/models",
        "/image/models",
        "/video/models",
        "/audio/models",
        "/embeddings/models",
        "/3d/models",
    ]) {
        const response = await fetchWorkerWithMock(
            `${path}?status=all&source=official&community=true`,
            {
                headers: {
                    "Pollinations-Model-Source": "community",
                    "Pollinations-Model-Status": "healthy",
                },
            },
        );
        expect(response.status, path).toBe(200);
        const body = (await response.json()) as
            | { data: Record<string, unknown>[] }
            | Record<string, unknown>[];
        const models = Array.isArray(body) ? body : body.data;
        expect(models.length, path).toBeGreaterThan(0);
        for (const model of models) {
            expect(model.community, path).toBe(false);
            expect(model.health, path).toEqual({
                status: "unknown",
                success_rate: null,
                sample_size: 0,
                window_minutes: 1440,
                checked_at: expect.any(String),
                stale: false,
            });
        }
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("requires enough samples and respects status boundaries", () => {
    for (const [successes, failures, status] of [
        [0, 0, "unknown"],
        [9, 0, "unknown"],
        [10, 0, "healthy"],
        [96, 4, "healthy"],
        [95, 5, "degraded"],
        [81, 19, "degraded"],
        [80, 20, "down"],
    ] as const) {
        expect(
            modelHealthFromCounts(successes, failures, 1440, null, false)
                .status,
        ).toBe(status);
    }
});

test("exposes supported Chat parameters across rich listings", async () => {
    const responses = await Promise.all([
        fetchWorker("/models"),
        fetchWorker("/text/models"),
    ]);
    const listings = await Promise.all(
        responses.map(async (response) => {
            expect(response.status).toBe(200);
            return (await response.json()) as Record<string, unknown>[];
        }),
    );

    for (const models of listings) {
        for (const model of models.filter(
            (m) => m.category === "text" && !m.community,
        )) {
            expect(model.supported_parameters, String(model.name)).toEqual(
                expect.any(Array),
            );
            expect(model, String(model.name)).not.toHaveProperty(
                "default_parameters",
            );
        }
        const byName = (name: string) =>
            models.find((model) => model.name === name);
        expect(byName("openai/gpt-5.4")).toMatchObject({
            supported_parameters: expect.not.arrayContaining([
                "temperature",
                "top_p",
            ]),
        });
        expect(byName("openai/gpt-oss-20b")).toMatchObject({
            supported_parameters: expect.arrayContaining([
                "temperature",
                "top_p",
            ]),
        });
        expect(byName("anthropic/claude-sonnet-4.6")).toMatchObject({
            supported_parameters: expect.arrayContaining([
                "temperature",
                "top_p",
                "reasoning_effort",
            ]),
        });
    }
});

test("keeps supported Chat parameters identical for aliases and list entries", async () => {
    const listResponse = await fetchWorker("/v1/models");
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as {
        data: Record<string, unknown>[];
    };
    const listed = list.data.find((model) => model.id === "openai/gpt-5.4");
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty("default_parameters");

    const aliasResponse = await fetchWorker("/v1/models/gpt-5.4");
    expect(aliasResponse.status).toBe(200);
    const alias = (await aliasResponse.json()) as Record<string, unknown>;
    expect(alias.id).toBe("openai/gpt-5.4");
    expect(alias.supported_parameters).toEqual(listed?.supported_parameters);
    expect(alias).not.toHaveProperty("default_parameters");
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
