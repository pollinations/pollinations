import { SELF } from "cloudflare:test";
import { getAudioModelsInfo } from "@shared/registry/model-info.ts";
import {
    getRegistryModelDefinition,
    getVisibleTextModels,
} from "@shared/registry/registry.ts";
import {
    createTestApiKey,
    RESTRICTED_IMAGE_TEST_MODEL,
    RESTRICTED_TEST_MODELS,
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

test("filters OpenAI-compatible model list by API key permissions", async ({
    restrictedApiKey,
}) => {
    const response = await fetchWorker("/v1/models", {
        headers: { Authorization: `Bearer ${restrictedApiKey}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        data: { id: string }[];
    };
    const modelIds = body.data.map((model) => model.id);
    const allowedModels = new Set<string>(RESTRICTED_TEST_MODELS);

    expect(modelIds.length).toBeGreaterThan(0);
    expect(modelIds.every((modelId) => allowedModels.has(modelId))).toBe(true);
    expect(modelIds).toContain(RESTRICTED_TEXT_TEST_MODEL);
});

test("filters image model list by API key permissions", async ({
    restrictedApiKey,
}) => {
    const response = await fetchWorker("/image/models", {
        headers: { Authorization: `Bearer ${restrictedApiKey}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { name: string }[];
    const modelNames = body.map((model) => model.name);
    const allowedModels = new Set<string>(RESTRICTED_TEST_MODELS);

    expect(modelNames.length).toBeGreaterThan(0);
    expect(modelNames.every((modelName) => allowedModels.has(modelName))).toBe(
        true,
    );
    expect(modelNames).toContain(RESTRICTED_IMAGE_TEST_MODEL);
});

test("empty model permissions deny access and return an empty catalog", async () => {
    const { key } = await createTestApiKey({
        allowedModels: [],
        user: { tierBalance: 100 },
    });
    const headers = { Authorization: `Bearer ${key}` };

    const modelsResponse = await fetchWorker("/v1/models", { headers });
    expect(modelsResponse.status).toBe(200);
    expect(await modelsResponse.json()).toEqual({
        object: "list",
        data: [],
    });

    const generationResponse = await fetchWorker(
        `/text/test?model=${RESTRICTED_TEXT_TEST_MODEL}`,
        { headers },
    );
    expect(generationResponse.status).toBe(403);
});

test("media routes own their endpoint-specific model defaults", async () => {
    const { key } = await createTestApiKey({
        allowedModels: ["zimage"],
        user: { packBalance: 100 },
    });

    const videoResponse = await fetchWorker("/video/test", {
        headers: { Authorization: `Bearer ${key}` },
    });
    const editResponse = await fetchWorker("/v1/images/edits", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            prompt: "make it blue",
            image: "https://example.test/cat.png",
        }),
    });

    expect(videoResponse.status).toBe(403);
    expect(editResponse.status).toBe(403);
});

test("filters OpenRouter text models by paid balance", async ({
    apiKey,
    paidApiKey,
}) => {
    const freeResponse = await fetchWorker("/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    const paidResponse = await fetchWorker("/v1/models", {
        headers: { Authorization: `Bearer ${paidApiKey}` },
    });

    expect(freeResponse.status).toBe(200);
    expect(paidResponse.status).toBe(200);

    const freeModels = (await freeResponse.json()) as {
        data: { id: string }[];
    };
    const paidModels = (await paidResponse.json()) as {
        data: { id: string }[];
    };
    const openRouterModelNames = getVisibleTextModels().filter(
        (model) => getRegistryModelDefinition(model).provider === "openrouter",
    );
    const freeModelNames = new Set(freeModels.data.map((model) => model.id));
    const paidModelNames = new Set(paidModels.data.map((model) => model.id));

    expect(openRouterModelNames.length).toBeGreaterThan(0);
    expect(
        openRouterModelNames.every((model) => !freeModelNames.has(model)),
    ).toBe(true);
    expect(
        openRouterModelNames.every((model) => paidModelNames.has(model)),
    ).toBe(true);

    const generation = await fetchWorker(
        "/text/paid-only-check?model=mistral",
        { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    expect(generation.status).toBe(402);
});

test("filters paid-only audio models by paid balance", async ({
    apiKey,
    paidApiKey,
}) => {
    const freeResponse = await fetchWorker("/audio/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    const paidResponse = await fetchWorker("/audio/models", {
        headers: { Authorization: `Bearer ${paidApiKey}` },
    });

    expect(freeResponse.status).toBe(200);
    expect(paidResponse.status).toBe(200);

    const freeModels = (await freeResponse.json()) as {
        name: string;
        paid_only?: boolean;
    }[];
    const paidModels = (await paidResponse.json()) as {
        name: string;
        paid_only?: boolean;
    }[];
    const expectedFreeModelNames = getAudioModelsInfo()
        .filter((model) => !model.paid_only)
        .map((model) => model.name);
    const expectedPaidModelNames = getAudioModelsInfo().map(
        (model) => model.name,
    );
    const expectedPaidOnlyModelNames = getAudioModelsInfo()
        .filter((model) => model.paid_only)
        .map((model) => model.name);

    expect(expectedFreeModelNames.length).toBeGreaterThan(0);
    expect(expectedPaidOnlyModelNames.length).toBeGreaterThan(0);
    expect(new Set(freeModels.map((model) => model.name))).toEqual(
        new Set(expectedFreeModelNames),
    );
    expect(new Set(paidModels.map((model) => model.name))).toEqual(
        new Set(expectedPaidModelNames),
    );
    expect(freeModels.some((model) => model.paid_only)).toBe(false);
    expect(paidModels.some((model) => model.paid_only)).toBe(true);
    expect(
        freeModels.some(
            (model) => model.name === "assemblyai/universal-3.5-pro",
        ),
    ).toBe(true);
    expect(
        paidModels.some(
            (model) => model.name === "assemblyai/universal-3.5-pro",
        ),
    ).toBe(true);
});

test("requires paid balance for Recraft vector", async ({
    apiKey,
    paidApiKey,
}) => {
    const freeCatalog = await fetchWorker("/image/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    const paidCatalog = await fetchWorker("/image/models", {
        headers: { Authorization: `Bearer ${paidApiKey}` },
    });
    const freeModels = (await freeCatalog.json()) as { name: string }[];
    const paidModels = (await paidCatalog.json()) as { name: string }[];

    expect(
        freeModels.some(
            (model) => model.name === "recraft/recraft-v4.1-vector",
        ),
    ).toBe(false);
    expect(
        paidModels.some(
            (model) => model.name === "recraft/recraft-v4.1-vector",
        ),
    ).toBe(true);

    const generation = await fetchWorker(
        "/image/paid-only-check?model=recraft-v4.1-vector&seed=24072499",
        { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    expect(generation.status).toBe(402);
});
