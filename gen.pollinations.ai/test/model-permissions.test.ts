import { SELF } from "cloudflare:test";
import {
    RESTRICTED_TEXT_TEST_MODEL,
    createTestApiKey,
    test,
} from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

test("retrieves a single OpenAI-compatible model by id and includes owned_by", async ({
    apiKey,
}) => {
    const response = await fetchWorker("/v1/models/flux", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.object).toBe("model");
    expect(body.id).toBe("flux");
    expect(typeof body.created).toBe("number");
    expect(typeof body.owned_by).toBe("string");
});

test("resolves a model alias for OpenAI-compatible retrieval", async ({
    apiKey,
}) => {
    const response = await fetchWorker("/v1/models/gemini-2", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.object).toBe("model");
    expect(body.id).toBe("gemini-2");
});

test("returns 404 for an unknown model id", async ({ apiKey }) => {
    const response = await fetchWorker("/v1/models/no-such-model", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(404);
});

test("returns 404 for a model hidden by api key permissions", async () => {
    const { key } = await createTestApiKey({
        allowedModels: ["zimage"],
        user: { packBalance: 100 },
    });
    const response = await fetchWorker(
        `/v1/models/${RESTRICTED_TEXT_TEST_MODEL}`,
        {
            headers: { Authorization: `Bearer ${key}` },
        },
    );

    expect(response.status).toBe(404);
});
