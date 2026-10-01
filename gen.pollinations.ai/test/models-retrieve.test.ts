import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { communityEndpoint } from "@shared/db/better-auth.ts";
import type { ModelHealthRow } from "@shared/model-health.ts";
import {
    createTestApiKey,
    createTestUser,
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, expect, vi } from "vitest";
import {
    getGenerationModelRegistry,
    resetGenerationModelRegistryCache,
} from "../src/model-registry.ts";

async function fetchWorker(path: string, init: RequestInit = {}) {
    const { default: worker } = await import("../src/index.ts");
    const context = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        { ...env, ENVIRONMENT: "test" } as CloudflareBindings,
        context,
    );
    await waitOnExecutionContext(context);
    return response;
}

beforeEach(() => {
    mockCatalogHealth([]);
});

afterEach(async () => {
    await resetGenerationModelRegistryCache(env);
    vi.restoreAllMocks();
});

function mockCatalogHealth(
    rows: ModelHealthRow[],
    status = 200,
    officialRows = rows,
) {
    vi.restoreAllMocks();
    const originalFetch = globalThis.fetch;
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
            const url = new URL(
                input instanceof Request ? input.url : String(input),
            );
            if (
                url.pathname === "/v0/pipes/model_catalog_health.json" ||
                url.pathname === "/v0/pipes/model_route_health.json"
            ) {
                return Response.json(
                    {
                        data:
                            url.pathname ===
                            "/v0/pipes/model_catalog_health.json"
                                ? rows
                                : officialRows,
                    },
                    { status },
                );
            }
            return originalFetch(input, init);
        });
}

test("official models stay discoverable across every list regardless of reliability", async () => {
    const registry = await getGenerationModelRegistry(env);
    const categories = ["text", "image", "video", "3d", "audio", "embedding"];
    const failing = categories.map((category) => {
        const entry = registry
            .visibleEntries()
            .find((entry) => entry.info.category === category);
        if (!entry) throw new Error(`Missing test category ${category}`);
        return entry;
    });
    mockCatalogHealth(
        failing.map((entry) => ({
            model: entry.id,
            event_type: entry.eventType,
            is_rollup: 1,
            status_2xx: 0,
            errors_5xx: 50,
        })),
    );

    for (const path of [
        "/models",
        "/v1/models",
        ...categories.map(
            (category) =>
                `/${category === "embedding" ? "embeddings" : category}/models`,
        ),
    ]) {
        const response = await fetchWorker(path);
        expect(response.status, path).toBe(200);
        const body = (await response.json()) as
            | { data: { id: string }[] }
            | { name: string }[];
        const ids = Array.isArray(body)
            ? body.map((row) => row.name)
            : body.data.map((row) => row.id);
        expect(
            ids.some((id) => failing.some((entry) => entry.id === id)),
            path,
        ).toBe(true);
    }
    for (const [query, headers] of [
        ["?reliability=all", {}],
        ["", { "Pollinations-Model-Reliability": "all" }],
        ["?reliability=all", { "Pollinations-Model-Reliability": "reliable" }],
    ] as const) {
        const response = await fetchWorker(`/models${query}`, {
            headers,
        });
        const models = (await response.json()) as { name: string }[];
        for (const entry of failing)
            expect(models.some((model) => model.name === entry.id)).toBe(true);
    }
    const overridden = await fetchWorker("/models?reliability=reliable", {
        headers: { "Pollinations-Model-Reliability": "all" },
    });
    expect(
        ((await overridden.json()) as { name: string }[]).some(
            (model) => model.name === failing[0].id,
        ),
    ).toBe(true);
    const exact = await fetchWorker(
        `/v1/models/${encodeURIComponent(failing[0].id)}`,
    );
    expect(exact.status).toBe(200);
    expect(await exact.json()).toMatchObject({
        id: failing[0].id,
        health: { success_rate: 0, requests: 50 },
    });
    // Discovery filtering never mutates the registry used for generation/fallbacks.
    expect(registry.resolve(failing[0].id)).toBe(failing[0]);
});

test("counts final fallback rescues, retains unknown models and fails open on unavailable analytics", async () => {
    const id = "openai/gpt-5-nano";
    mockCatalogHealth(
        [
            {
                model: id,
                event_type: "generate.text",
                is_rollup: 1,
                status_2xx: 0,
                errors_5xx: 50,
            },
        ],
        200,
        [
            {
                model: id,
                event_type: "generate.text",
                is_rollup: 0,
                status_2xx: 0,
                errors_5xx: 50,
            },
            {
                model: id,
                event_type: "generate.text",
                is_rollup: 1,
                status_2xx: 46,
                errors_5xx: 4,
            },
        ],
    );
    const response = await fetchWorker("/text/models");
    const models = (await response.json()) as {
        name: string;
        health: { success_rate: number | null };
    }[];
    expect(models.find((model) => model.name === id)?.health.success_rate).toBe(
        92,
    );
    expect(models.some((model) => model.health.success_rate === null)).toBe(
        true,
    );
    vi.restoreAllMocks();
    mockCatalogHealth([], 503);
    const unavailable = await fetchWorker("/text/models");
    expect(unavailable.status).toBe(200);
    const all = (await unavailable.json()) as {
        name: string;
        health: { status: string };
    }[];
    expect(all.some((model) => model.name === id)).toBe(true);
    expect(all.every((model) => model.health.status === "unknown")).toBe(true);
});

test("show all does not bypass key permissions or paid access", async ({
    restrictedApiKey,
    apiKey,
}) => {
    mockCatalogHealth([]);
    const restricted = await fetchWorker("/text/models?reliability=all", {
        headers: { Authorization: `Bearer ${restrictedApiKey}` },
    });
    expect(
        ((await restricted.json()) as { name: string }[]).map(
            (model) => model.name,
        ),
    ).toEqual([RESTRICTED_TEXT_TEST_MODEL]);
    const unpaid = await fetchWorker("/models?reliability=all", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(
        ((await unpaid.json()) as { paid_only?: boolean }[]).some(
            (model) => model.paid_only,
        ),
    ).toBe(false);
});

test("community reliability is discovery-only and show all preserves manual hiding and privacy", async () => {
    const owner = `catalog-${crypto.randomUUID().slice(0, 8)}`;
    const ownerUserId = await createTestUser({ githubUsername: owner });
    const { key: ownerKey } = await createTestApiKey({ userId: ownerUserId });
    await drizzle(env.DB)
        .insert(communityEndpoint)
        .values(
            ["public", "passing", "private", "hidden"].map((name) => ({
                id: crypto.randomUUID(),
                ownerUserId,
                name,
                title: name,
                type: "proxy" as const,
                baseUrl: "https://provider.example/v1/chat/completions",
                upstreamModel: "test",
                visibility:
                    name === "private"
                        ? ("private" as const)
                        : ("public" as const),
                hiddenAt: name === "hidden" ? new Date() : null,
                hiddenBy: name === "hidden" ? "owner" : null,
                payload: JSON.stringify({
                    bearerTokenCiphertext:
                        "test-placeholder-not-used-for-generation",
                    api: "chat_completions",
                    modality: "text",
                    imagePricing: "request",
                    inputModalities: ["text"],
                    perUserRpm: null,
                    fallbacks: [],
                    prices: {},
                }),
            })),
        );
    await resetGenerationModelRegistryCache(env);
    const id = `community/${owner}/public`;
    const passingId = `community/${owner}/passing`;
    const privateId = `community/${owner}/private`;
    mockCatalogHealth([
        {
            model: id,
            event_type: "generate.text",
            is_rollup: 1,
            status_2xx: 40,
            errors_5xx: 10,
        },
        {
            model: passingId,
            event_type: "generate.text",
            is_rollup: 1,
            status_2xx: 41,
            errors_5xx: 9,
        },
        {
            model: privateId,
            event_type: "generate.text",
            is_rollup: 1,
            status_2xx: 0,
            errors_5xx: 10,
        },
    ]);
    const normal = await fetchWorker("/models?source=community");
    const normalModels = (await normal.json()) as { name: string }[];
    expect(normalModels.some((model) => model.name === id)).toBe(false);
    expect(normalModels.some((model) => model.name === passingId)).toBe(true);
    const ownerList = await fetchWorker("/models?source=community", {
        headers: { Authorization: `Bearer ${ownerKey}` },
    });
    expect(
        ((await ownerList.json()) as { name: string }[]).some(
            (model) => model.name === privateId,
        ),
    ).toBe(true);
    const unfiltered = await fetchWorker(
        "/models?source=community&reliability=all",
    );
    expect(
        ((await unfiltered.json()) as { name: string }[])
            .filter((model) => model.name.startsWith(`community/${owner}/`))
            .map((model) => model.name)
            .sort(),
    ).toEqual([passingId, id].sort());
    expect(
        (await fetchWorker(`/v1/models/${encodeURIComponent(id)}`)).status,
    ).toBe(200);
    const registry = await getGenerationModelRegistry(env);
    expect(registry.resolve(id)?.visible).toBe(true);
});

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

test("accepts client-safe model filter headers", async () => {
    const response = await fetchWorker("/text/models", {
        headers: { "Pollinations-Model-Source": "official" },
    });

    expect(response.status).toBe(200);
    const models = (await response.json()) as {
        name: string;
        community: boolean;
    }[];
    expect(models.length).toBeGreaterThan(0);
    expect(models.every(({ community }) => community === false)).toBe(true);
});

test("rejects invalid discovery filters", async () => {
    const responses = await Promise.all([
        fetchWorker("/models?source=other"),
        fetchWorker("/models?reliability=other"),
        fetchWorker("/models", {
            headers: { "Pollinations-Model-Reliability": "other" },
        }),
        fetchWorker("/models", {
            headers: { "Pollinations-Model-Source": "other" },
        }),
    ]);

    expect(responses.every(({ status }) => status === 400)).toBe(true);
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

test("retired Nova models and aliases disappear from catalogs and cannot generate", async ({
    paidApiKey,
}) => {
    const retiredModels = [
        {
            category: "image",
            ids: ["amazon/nova-canvas-v1", "amazon-nova-canvas", "nova-canvas"],
        },
        {
            category: "video",
            ids: ["amazon/nova-reel-v1", "amazon-nova-reel", "nova-reel"],
        },
    ] as const;

    for (const path of [
        "/models",
        "/image/models",
        "/video/models",
        "/v1/models",
    ]) {
        const response = await fetchWorker(path);
        expect(response.status, path).toBe(200);
        const body = (await response.json()) as
            | { data: { id: string }[] }
            | { name: string }[];
        const ids = Array.isArray(body)
            ? body.map((model) => model.name)
            : body.data.map((model) => model.id);
        for (const retired of retiredModels) {
            for (const id of retired.ids) {
                expect(ids, path).not.toContain(id);
            }
        }
    }

    for (const retired of retiredModels) {
        for (const id of retired.ids) {
            const lookup = await fetchWorker(
                `/v1/models/${encodeURIComponent(id)}`,
            );
            expect(lookup.status, id).toBe(404);

            const generation = await fetchWorker(
                `/${retired.category}/retired-model?model=${encodeURIComponent(id)}`,
                { headers: { Authorization: `Bearer ${paidApiKey}` } },
            );
            expect(generation.status, id).toBe(400);
            expect(await generation.text()).toContain("Invalid model or alias");

            const compatible = await fetchWorker("/v1/images/generations", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ model: id, prompt: "retired model" }),
            });
            expect(compatible.status, id).toBe(400);
            expect(await compatible.text()).toContain("Invalid model or alias");
        }
    }
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

test("advertises reasoning capability for Azure GPT models that accept reasoning_effort", async () => {
    const response = await fetchWorker("/v1/models");
    expect(response.status).toBe(200);
    const list = (await response.json()) as {
        data: { id: string; capabilities?: string[] }[];
    };
    for (const id of [
        "openai/gpt-5.4-nano",
        "openai/gpt-5-nano",
        "openai/gpt-5.4-mini",
    ]) {
        const entry = list.data.find((model) => model.id === id);
        expect(entry, id).toBeDefined();
        expect(entry?.capabilities, id).toEqual(
            expect.arrayContaining(["reasoning"]),
        );
    }
});
