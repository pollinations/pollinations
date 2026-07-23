import { SELF } from "cloudflare:test";
import { getAudioModelsInfo } from "@shared/registry/model-info.ts";
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

test("accepts OAuth keys only at their resource", async () => {
    const createOAuthKey = (resource: string) =>
        createTestApiKey({
            type: "secret",
            oauth: {
                clientId: "https://client.example/oauth-client.json",
                resource,
            },
            allowedModels: [RESTRICTED_TEXT_TEST_MODEL],
            user: { tierBalance: 100 },
        });
    const [{ key: genToken }, { key: mcpToken }] = await Promise.all([
        createOAuthKey("https://gen.pollinations.ai"),
        createOAuthKey("https://mcp.pollinations.ai"),
    ]);

    const accepted = await fetchWorker("/v1/models", {
        headers: { Authorization: `Bearer ${genToken}` },
    });
    expect(accepted.status).toBe(200);
    const acceptedBody = (await accepted.json()) as {
        data: { id: string }[];
    };
    expect(acceptedBody.data.map(({ id }) => id)).toEqual([
        RESTRICTED_TEXT_TEST_MODEL,
    ]);

    const rejected = await fetchWorker("/v1/models", {
        headers: { Authorization: `Bearer ${mcpToken}` },
    });
    expect(rejected.status).toBe(200);
    const rejectedBody = (await rejected.json()) as {
        data: { id: string }[];
    };
    expect(rejectedBody.data.length).toBeGreaterThan(1);
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
