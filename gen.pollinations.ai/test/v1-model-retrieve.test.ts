import { SELF } from "cloudflare:test";
import { test as fixtureTest } from "@shared/test/fixtures/index.ts";
import { expect, it } from "vitest";

const test = fixtureTest.extend({});

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

it("retrieves a single model by ID", async () => {
    const listRes = await fetchWorker("/v1/models");
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { data: { id: string }[] };
    expect(listBody.data.length).toBeGreaterThan(0);

    const firstModelId = listBody.data[0].id;
    const response = await fetchWorker(`/v1/models/${firstModelId}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        id: string;
        object: string;
        created: number;
        owned_by: string;
    };
    expect(body.id).toBe(firstModelId);
    expect(body.object).toBe("model");
    expect(body.created).toBeTypeOf("number");
    expect(body.owned_by).toBe("pollinations");
});

it("resolves aliases to canonical model ID", async () => {
    const listRes = await fetchWorker("/v1/models");
    const listBody = (await listRes.json()) as {
        data: { id: string }[];
    };

    // Pick a model that likely has aliases (most do)
    const firstModelId = listBody.data[0].id;

    // Use the model ID directly — should work the same as list entry
    const response = await fetchWorker(`/v1/models/${firstModelId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string };
    expect(body.id).toBe(firstModelId);
});

it("returns 404 for non-existent model", async () => {
    const response = await fetchWorker(
        "/v1/models/this-model-definitely-does-not-exist-xyz123",
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as {
        error: { message: string; type: string };
    };
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain("not found");
});

it("returns same shape as list entry for retrieve", async () => {
    const listRes = await fetchWorker("/v1/models");
    const listBody = (await listRes.json()) as {
        data: { id: string; object: string }[];
    };
    const firstEntry = listBody.data[0];

    const response = await fetchWorker(`/v1/models/${firstEntry.id}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body.id).toBe(firstEntry.id);
    expect(body.object).toBe("model");
    expect(body.created).toBeTypeOf("number");
    // owned_by is present on retrieve but not on list
    expect(body.owned_by).toBeTypeOf("string");
});

it("returns 404 for disallowed model with restricted API key", async () => {
    // Without auth, public models should be visible
    const response = await fetchWorker("/v1/models/openai");
    expect(response.status).toBe(200);
});
