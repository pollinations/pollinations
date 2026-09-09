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

test("exposes supported_parameters and default_parameters across model endpoints and aliases", async () => {
    // 1. /v1/models/openai/gpt-5.4-nano via canonical ID and alias
    const canonicalRes = await fetchWorker("/v1/models/openai%2Fgpt-5.4-nano");
    expect(canonicalRes.status).toBe(200);
    const canonicalBody = (await canonicalRes.json()) as Record<
        string,
        unknown
    >;
    expect(canonicalBody.supported_parameters).toEqual(
        expect.arrayContaining([
            "temperature",
            "top_p",
            "max_tokens",
            "tools",
            "stream",
        ]),
    );
    expect(canonicalBody.default_parameters).toEqual({
        temperature: 1,
        top_p: 1,
        stream: false,
    });

    const aliasRes = await fetchWorker("/v1/models/gpt-5.4-nano");
    expect(aliasRes.status).toBe(200);
    const aliasBody = (await aliasRes.json()) as Record<string, unknown>;
    expect(aliasBody.supported_parameters).toEqual(
        canonicalBody.supported_parameters,
    );
    expect(aliasBody.default_parameters).toEqual(
        canonicalBody.default_parameters,
    );

    // 2. Compare /v1/models list, /models list, and /text/models list entries
    const v1ListRes = await fetchWorker("/v1/models");
    const v1List = (
        (await v1ListRes.json()) as { data: Record<string, unknown>[] }
    ).data;
    const nanoV1 = v1List.find((m) => m.id === "openai/gpt-5.4-nano");
    expect(nanoV1?.supported_parameters).toEqual(
        canonicalBody.supported_parameters,
    );
    expect(nanoV1?.default_parameters).toEqual(
        canonicalBody.default_parameters,
    );

    const modelsListRes = await fetchWorker("/models?community=false");
    const modelsList = (await modelsListRes.json()) as Record<
        string,
        unknown
    >[];
    const nanoModels = modelsList.find((m) => m.name === "openai/gpt-5.4-nano");
    expect(nanoModels?.supported_parameters).toEqual(
        canonicalBody.supported_parameters,
    );
    expect(nanoModels?.default_parameters).toEqual(
        canonicalBody.default_parameters,
    );

    const textModelsRes = await fetchWorker("/text/models?community=false");
    const textModels = (await textModelsRes.json()) as Record<
        string,
        unknown
    >[];
    const nanoText = textModels.find((m) => m.name === "openai/gpt-5.4-nano");
    expect(nanoText?.supported_parameters).toEqual(
        canonicalBody.supported_parameters,
    );
    expect(nanoText?.default_parameters).toEqual(
        canonicalBody.default_parameters,
    );
});

test("verified official Chat models expose distinct capabilities in supported_parameters and default_parameters", async () => {
    // Standard chat model: openai/gpt-5.4-nano
    const nanoRes = await fetchWorker("/v1/models/openai%2Fgpt-5.4-nano");
    const nano = (await nanoRes.json()) as Record<string, unknown>;
    expect(nano.supported_parameters).toEqual(
        expect.arrayContaining([
            "temperature",
            "top_p",
            "max_tokens",
            "tools",
            "stream",
        ]),
    );
    expect(nano.default_parameters).toEqual({
        temperature: 1,
        top_p: 1,
        stream: false,
    });

    // Reasoning model: openai/gpt-5.4
    const reasoningRes = await fetchWorker("/v1/models/openai%2Fgpt-5.4");
    const reasoning = (await reasoningRes.json()) as Record<string, unknown>;
    expect(reasoning.supported_parameters).toContain("reasoning_effort");
    expect(reasoning.default_parameters).toEqual({ stream: false });

    // Search model: perplexity/sonar
    const searchRes = await fetchWorker("/v1/models/perplexity%2Fsonar");
    const search = (await searchRes.json()) as Record<string, unknown>;
    expect(search.supported_parameters).toEqual([
        "search_context_size",
        "max_tokens",
        "stream",
    ]);
    expect(search.default_parameters).toEqual({
        search_context_size: "low",
        stream: false,
    });

    // Audio chat model: openai/gpt-audio-mini
    const audioRes = await fetchWorker("/v1/models/openai%2Fgpt-audio-mini");
    const audio = (await audioRes.json()) as Record<string, unknown>;
    expect(audio.supported_parameters).toEqual(
        expect.arrayContaining([
            "modalities",
            "audio",
            "temperature",
            "top_p",
            "stream",
        ]),
    );
    expect(audio.default_parameters).toEqual({
        modalities: ["text"],
        audio: { voice: "alloy", format: "mp3" },
        temperature: 1,
        top_p: 1,
        stream: false,
    });
});
