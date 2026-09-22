import {
    createExecutionContext,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
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
        fetchWorker("/models", {
            headers: { "Pollinations-Model-Source": "other" },
        }),
        fetchWorker("/models?reliability=unreliable"),
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

test("reliability=reliable excludes models measured as down", async () => {
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("model_route_health")) {
            return Response.json({
                data: [
                    {
                        model: "openai/gpt-5.4-nano",
                        event_type: "generate.text",
                        is_rollup: 1,
                        status_2xx: 10,
                        errors_5xx: 40,
                    },
                    {
                        model: "openai/gpt-5-nano",
                        event_type: "generate.text",
                        is_rollup: 1,
                        status_2xx: 100,
                        errors_5xx: 0,
                    },
                ],
            });
        }
        return originalFetch(input as RequestInfo, init);
    });

    const all = await fetchWorkerWithMock("/text/models");
    expect(all.status).toBe(200);
    const allModels = (await all.json()) as {
        name: string;
        health?: { status: string };
    }[];
    expect(
        allModels.find((m) => m.name === "openai/gpt-5.4-nano")?.health?.status,
    ).toBe("down");
    expect(
        allModels.find((m) => m.name === "openai/gpt-5-nano")?.health?.status,
    ).toBe("healthy");

    const reliable = await fetchWorkerWithMock(
        "/text/models?reliability=reliable",
    );
    expect(reliable.status).toBe(200);
    const reliableModels = (await reliable.json()) as { name: string }[];
    expect(reliableModels.some((m) => m.name === "openai/gpt-5.4-nano")).toBe(
        false,
    );
    expect(reliableModels.some((m) => m.name === "openai/gpt-5-nano")).toBe(
        true,
    );
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
