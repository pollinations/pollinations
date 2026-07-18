import { SELF } from "cloudflare:test";
import { getAudioModelsInfo } from "@shared/registry/model-info.ts";
import {
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
    expect(freeModels.map((model) => model.name)).toEqual(
        expectedFreeModelNames,
    );
    expect(paidModels.map((model) => model.name)).toEqual(
        expectedPaidModelNames,
    );
    expect(freeModels.some((model) => model.paid_only)).toBe(false);
    expect(paidModels.some((model) => model.paid_only)).toBe(true);
});
