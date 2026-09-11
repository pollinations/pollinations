import { SELF } from "cloudflare:test";
import {
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

test("retrieves a model by canonical ID", async () => {
    const response = await fetchWorker("/v1/models/openai-fast");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.id).toBe("openai-fast");
    expect(body.object).toBe("model");
    expect(typeof body.created).toBe("number");
    // Stable registry metadata, not the request wall clock
    expect(body.created as number).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000),
    );
    expect(typeof body.owned_by).toBe("string");
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
    expect(aliasBody.id).toBe("openai-fast");

    const byId = await fetchWorker("/v1/models/openai-fast");
    const idBody = (await byId.json()) as { created: number };
    expect(aliasBody.created).toBe(idBody.created);
});

test("retrieve matches the list entry exactly (shared mapper)", async () => {
    const listResponse = await fetchWorker("/v1/models");
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as {
        data: Record<string, unknown>[];
    };
    const listed = list.data.find((m) => m.id === "openai-fast");
    expect(listed).toBeDefined();

    const retrieveResponse = await fetchWorker("/v1/models/openai-fast");
    const retrieved = (await retrieveResponse.json()) as Record<
        string,
        unknown
    >;
    expect(retrieved).toEqual(listed);
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
        `/v1/models/${RESTRICTED_TEXT_TEST_MODEL}`,
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
    expect(body.id).toBe("krea");
});

test("applies the same 404 rule to aliases of hidden models", async ({
    apiKey,
}) => {
    const response = await fetchWorker("/v1/models/krea-2", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(response.status).toBe(404);
});

// --- supported_parameters and default_parameters ---

test("exposes supported_parameters and default_parameters on /v1/models", async () => {
    const response = await fetchWorker("/v1/models");
    expect(response.status).toBe(200);
    const list = (await response.json()) as {
        data: Record<string, unknown>[];
    };

    const openai = list.data.find((m) => m.id === "openai");
    expect(openai).toBeDefined();
    expect(Array.isArray(openai!.supported_parameters)).toBe(true);
    expect(openai!.supported_parameters).toContain("temperature");
    expect(openai!.supported_parameters).toContain("tools");
    expect(openai!.supported_parameters).not.toContain("reasoning_effort");
    expect(openai!.default_parameters).toEqual({ temperature: 1.0 });
});

test("reasoning model includes reasoning_effort in supported_parameters", async () => {
    const response = await fetchWorker("/v1/models/gpt-5.4");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.supported_parameters).toContain("reasoning_effort");
    expect(body.supported_parameters).toContain("tools");
});

test("search model includes web_search_options in supported_parameters", async () => {
    const response = await fetchWorker("/v1/models/gemini-3-flash");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.supported_parameters).toContain("web_search_options");
    expect(body.supported_parameters).toContain("tools");
});

test("alias resolves with same supported_parameters as canonical", async () => {
    const byAlias = await fetchWorker("/v1/models/gpt-5.4-nano");
    expect(byAlias.status).toBe(200);
    const aliasBody = (await byAlias.json()) as Record<string, unknown>;

    const byId = await fetchWorker("/v1/models/openai");
    const idBody = (await byId.json()) as Record<string, unknown>;

    expect(aliasBody.supported_parameters).toEqual(idBody.supported_parameters);
    expect(aliasBody.default_parameters).toEqual(idBody.default_parameters);
});

test("models without supported_parameters omit the field", async () => {
    const response = await fetchWorker("/v1/models/openai-fast");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    // openai-fast does not have supportedParameters set, so field should be absent
    expect("supported_parameters" in body).toBe(false);
    expect("default_parameters" in body).toBe(false);
});

test("supported_parameters are consistent between /v1/models list and /v1/models/:id", async () => {
    const listResponse = await fetchWorker("/v1/models");
    const list = (await listResponse.json()) as {
        data: Record<string, unknown>[];
    };
    const listed = list.data.find((m) => m.id === "gpt-5.4");

    const retrieveResponse = await fetchWorker("/v1/models/gpt-5.4");
    const retrieved = (await retrieveResponse.json()) as Record<
        string,
        unknown
    >;

    expect(retrieved.supported_parameters).toEqual(
        listed!.supported_parameters,
    );
    expect(retrieved.default_parameters).toEqual(listed!.default_parameters);
});
