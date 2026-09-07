import { env, SELF } from "cloudflare:test";
import { apikey } from "@shared/db/better-auth.ts";
import { getAudioModelsInfo } from "@shared/registry/model-info.ts";
import {
    getRegistryModelDefinition,
    getVisibleTextModels,
} from "@shared/registry/registry.ts";
import { filterPermissionsToVisibleModels } from "@shared/registry/visible-model-ids.ts";
import {
    createTestApiKey,
    RESTRICTED_IMAGE_TEST_MODEL,
    RESTRICTED_TEST_MODELS,
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { expect } from "vitest";
import { type AuthEnv, authFromSnapshot } from "../src/middleware/auth.ts";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

test("catalog metadata exposes publisher rather than author or brand", async () => {
    const response = await fetchWorker("/models");
    expect(response.status).toBe(200);
    const models = (await response.json()) as Record<string, unknown>[];
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
        expect(typeof model.publisher).toBe("string");
        expect(model).not.toHaveProperty("author");
        expect(model).not.toHaveProperty("brand");
    }
});

test("permission readback canonicalizes aliases without exposing hidden or unknown entries", () => {
    const stored = {
        models: ["openai", "openai/gpt-5.4-nano", "owner/custom", "unknown"],
        account: ["profile"],
    };
    expect(
        filterPermissionsToVisibleModels(
            stored,
            new Set(["openai/gpt-5.4-nano", "owner/custom"]),
        ),
    ).toEqual({
        models: ["openai/gpt-5.4-nano", "owner/custom"],
        account: ["profile"],
    });
    expect(stored.models).toContain("unknown");
    expect(
        filterPermissionsToVisibleModels(
            { models: [] },
            new Set(["openai/gpt-5.4-nano"]),
        ),
    ).toEqual({ models: [] });
});

test("legacy stored allowlists still filter catalogs after canonical promotion", async () => {
    const { key, id } = await createTestApiKey({
        allowedModels: ["nanobanana2"],
        user: { packBalance: 100 },
    });
    // Simulate an old Enter writer after the one-time migration has run.
    await drizzle(env.DB)
        .update(apikey)
        .set({ permissions: JSON.stringify({ models: ["nanobanana2"] }) })
        .where(eq(apikey.id, id));
    const headers = { Authorization: `Bearer ${key}` };
    const catalog = await fetchWorker("/image/models", { headers });
    expect(catalog.status).toBe(200);
    expect(
        ((await catalog.json()) as { name: string }[]).map(
            (model) => model.name,
        ),
    ).toEqual(["google/gemini-3.1-flash-image"]);
    const denied = await fetchWorker("/text/test?model=openai", { headers });
    expect(denied.status).toBe(403);
    const stored = await drizzle(env.DB)
        .select({ permissions: apikey.permissions })
        .from(apikey)
        .where(eq(apikey.id, id));
    expect(JSON.parse(stored[0].permissions ?? "null")).toEqual({
        models: ["nanobanana2"],
    });
});

test("restored auth snapshots normalize aliases once without expanding model or account scope", async () => {
    const snapshot = {
        user: { id: "permission-test", tier: "seed" },
        apiKey: {
            id: "test",
            permissions: {
                models: ["openai", "openai/gpt-5.4-nano", "owner/custom"],
                account: ["profile"],
            },
        },
    };
    const app = new Hono<AuthEnv>();
    app.use("*", authFromSnapshot(snapshot));
    app.get("/:model", (c) => {
        const model = c.req.param("model");
        c.set("model", {
            requested: model,
            resolved: model,
        });
        c.var.auth.requireModelAccess();
        return c.json(c.var.auth.apiKey?.permissions);
    });
    for (const model of ["openai/gpt-5.4-nano", "owner/custom"]) {
        const response = await app.request(`/${encodeURIComponent(model)}`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            models: ["openai/gpt-5.4-nano", "owner/custom"],
            account: ["profile"],
        });
    }
    expect((await app.request("/other%2Fcustom")).status).toBe(403);
    expect((await app.request("/anthropic%2Fclaude-haiku-4.5")).status).toBe(
        403,
    );
    expect(snapshot.apiKey.permissions.models).toEqual([
        "openai",
        "openai/gpt-5.4-nano",
        "owner/custom",
    ]);
});

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

test("canonicalizes aliases in new model permissions", async () => {
    const { key } = await createTestApiKey({
        allowedModels: ["nanobanana2"],
        user: { packBalance: 100 },
    });
    const response = await fetchWorker("/image/models", {
        headers: { Authorization: `Bearer ${key}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { name: string }[];
    expect(body.map((model) => model.name)).toEqual([
        "google/gemini-3.1-flash-image",
    ]);
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
