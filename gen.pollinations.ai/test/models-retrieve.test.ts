import { SELF } from "cloudflare:test";
import {
    RESTRICTED_TEST_MODELS,
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

test("retrieves a single model in the same shape as the list", async () => {
    const [listResponse, retrieveResponse] = await Promise.all([
        fetchWorker("/v1/models"),
        fetchWorker(`/v1/models/${RESTRICTED_TEXT_TEST_MODEL}`),
    ]);

    expect(listResponse.status).toBe(200);
    expect(retrieveResponse.status).toBe(200);

    const listBody = (await listResponse.json()) as {
        data: Record<string, unknown>[];
    };
    const retrieveBody = (await retrieveResponse.json()) as Record<
        string,
        unknown
    >;

    const listed = listBody.data.find(
        (model) => model.id === RESTRICTED_TEXT_TEST_MODEL,
    );
    expect(listed).toBeDefined();
    // Same shape and stable metadata as the list entry
    expect(retrieveBody).toEqual(listed);
    expect(retrieveBody.id).toBe(RESTRICTED_TEXT_TEST_MODEL);
    expect(retrieveBody.object).toBe("model");
    expect(typeof retrieveBody.created).toBe("number");
    expect(retrieveBody.owned_by).toBe("pollinations");
});

test("resolves aliases to the canonical model ID", async () => {
    // "openai" is the canonical id of a visible model with aliases
    const alias = "gpt-5.4-nano";

    const [canonicalResponse, aliasResponse] = await Promise.all([
        fetchWorker("/v1/models/openai"),
        fetchWorker(`/v1/models/${alias}`),
    ]);

    expect(canonicalResponse.status).toBe(200);
    expect(aliasResponse.status).toBe(200);

    const canonical = (await canonicalResponse.json()) as { id: string };
    const viaAlias = (await aliasResponse.json()) as { id: string };

    expect(viaAlias.id).toBe(canonical.id);
    expect(viaAlias.id).toBe("openai");
});

test("returns 404 for missing models", async () => {
    const response = await fetchWorker("/v1/models/does-not-exist-xyz");

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBeDefined();
});

test("returns 404 for models excluded by API key permissions", async ({
    restrictedApiKey,
}) => {
    // "openai" is visible publicly but outside RESTRICTED_TEST_MODELS
    const authHeaders = { Authorization: `Bearer ${restrictedApiKey}` };

    const deniedListResponse = await fetchWorker("/v1/models/openai", {
        headers: authHeaders,
    });
    expect(deniedListResponse.status).toBe(404);

    // Allowed models retrieve fine with the same key
    for (const allowedModel of RESTRICTED_TEST_MODELS) {
        const allowedResponse = await fetchWorker(`/v1/models/${allowedModel}`, {
            headers: authHeaders,
        });
        expect(allowedResponse.status).toBe(200);
        const body = (await allowedResponse.json()) as { id: string };
        expect(body.id).toBe(allowedModel);
    }
});
