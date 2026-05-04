import { SELF } from "cloudflare:test";
import { test } from "@shared/test/fixtures/index.ts";
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

    expect(modelIds).toContain("openai-fast");
    expect(modelIds).not.toContain("openai");
    expect(modelIds).not.toContain("mistral");
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

    expect(modelNames).toContain("flux");
    expect(modelNames).not.toContain("turbo");
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

    const freeModelNames = (
        (await freeResponse.json()) as { name: string }[]
    ).map((model) => model.name);
    const paidModelNames = (
        (await paidResponse.json()) as { name: string }[]
    ).map((model) => model.name);

    expect(freeModelNames).toContain("universal-2");
    expect(freeModelNames).not.toContain("universal-3-pro");
    expect(paidModelNames).toContain("universal-3-pro");
});
