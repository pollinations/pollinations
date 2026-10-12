import { env, SELF } from "cloudflare:test";
import { apikey, user as userTable } from "@shared/db/better-auth.ts";
import { getAudioModelsInfo } from "@shared/registry/model-info.ts";
import {
    getRegistryModelDefinition,
    getVisibleTextModels,
} from "@shared/registry/registry.ts";
import {
    createTestApiKey,
    RESTRICTED_IMAGE_TEST_MODEL,
    RESTRICTED_TEST_CATEGORIES,
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { expect } from "vitest";
import {
    type AuthEnv,
    authFromSnapshot,
    keyPermissionsLink,
} from "../src/middleware/auth.ts";
import { TEXT_BALANCE_NOTICE_ENABLED } from "../src/middleware/text-balance-notice.ts";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

test("banned app owners block direct keys and existing BYOP keys", async () => {
    const owner = await createTestApiKey();
    const caller = await createTestApiKey();
    const db = drizzle(env.DB);
    await db
        .update(apikey)
        .set({ byopClientKeyId: owner.id })
        .where(eq(apikey.id, caller.id));
    await db
        .update(userTable)
        .set({ banned: true })
        .where(eq(userTable.id, owner.userId));
    for (const key of [owner.key, caller.key]) {
        expect(
            (
                await fetchWorker("/v1/models", {
                    headers: { Authorization: `Bearer ${key}` },
                })
            ).status,
        ).toBe(403);
    }
    await db
        .update(userTable)
        .set({ banned: false })
        .where(eq(userTable.id, owner.userId));
    expect(
        (
            await fetchWorker("/v1/models", {
                headers: { Authorization: `Bearer ${caller.key}` },
            })
        ).status,
    ).toBe(200);
});

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

test("model IDs and aliases widen to their categories when a key is saved", async () => {
    const { id } = await createTestApiKey({
        allowedModels: ["nanobanana2", RESTRICTED_TEXT_TEST_MODEL, "audio"],
    });
    const [stored] = await drizzle(env.DB)
        .select({ permissions: apikey.permissions })
        .from(apikey)
        .where(eq(apikey.id, id));
    expect(JSON.parse(stored.permissions ?? "null")).toEqual({
        models: ["text", "image", "audio"],
    });
    await expect(
        createTestApiKey({ allowedModels: ["not-a-model"] }),
    ).rejects.toThrow("is not a model category");
});

test("a category allows every model in it and nothing else", async () => {
    const app = new Hono<AuthEnv>();
    app.use(
        "*",
        authFromSnapshot({
            user: { id: "permission-test", tier: "seed" },
            apiKey: { id: "test", permissions: { models: ["image"] } },
        }),
    );
    app.get("/:category/:model", (c) => {
        const model = c.req.param("model");
        c.set("model", {
            requested: model,
            resolved: model,
            definition: {
                category: c.req.param("category") as "image" | "text",
            },
        });
        c.var.auth.requireModelAccess();
        return c.text("ok");
    });
    expect((await app.request("/image/any-image-model")).status).toBe(200);
    const denied = await app.request("/text/openai");
    expect(denied.status).toBe(403);
    expect(await denied.text()).toBe(
        "Model 'openai' is not allowed for this API key, which does not allow text models. Manage key permissions at https://enter.pollinations.ai/edit-key?id=test",
    );
});

test("keyPermissionsLink resolves production and staging editor links", () => {
    expect(keyPermissionsLink("key-1")).toBe(
        "https://enter.pollinations.ai/edit-key?id=key-1",
    );
    expect(keyPermissionsLink("key-1", "staging")).toBe(
        "https://staging.enter.pollinations.ai/edit-key?id=key-1",
    );
});

test("requireModelAccess uses staging host for staging environment", async () => {
    const snapshot = {
        user: { id: "permission-test", tier: "seed" },
        apiKey: {
            id: "staging-key-id",
            permissions: {
                models: ["text"],
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
            definition: { category: "image" },
        });
        c.var.auth.requireModelAccess();
        return c.json(c.var.auth.apiKey?.permissions);
    });

    const responseEnv = await app.request("/forbidden-model", undefined, {
        ENVIRONMENT: "staging",
    } as CloudflareBindings);
    expect(responseEnv.status).toBe(403);
    expect(await responseEnv.text()).toBe(
        "Model 'forbidden-model' is not allowed for this API key, which does not allow image models. Manage key permissions at https://staging.enter.pollinations.ai/edit-key?id=staging-key-id",
    );
});

test("filters model lists to the API key's categories", async ({
    restrictedApiKey,
}) => {
    const headers = { Authorization: `Bearer ${restrictedApiKey}` };
    const [catalog, compatible] = await Promise.all([
        fetchWorker("/models", { headers }),
        fetchWorker("/v1/models", { headers }),
    ]);
    expect(catalog.status).toBe(200);
    expect(compatible.status).toBe(200);
    const models = (await catalog.json()) as {
        name: string;
        category: string;
    }[];
    expect(new Set(models.map(({ category }) => category))).toEqual(
        new Set(RESTRICTED_TEST_CATEGORIES),
    );
    expect(models.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
            RESTRICTED_TEXT_TEST_MODEL,
            RESTRICTED_IMAGE_TEST_MODEL,
        ]),
    );
    const { data } = (await compatible.json()) as { data: { id: string }[] };
    expect(data.map(({ id }) => id)).toEqual(models.map(({ name }) => name));
});

test("applies the model list limit after API key permissions", async ({
    restrictedApiKey,
}) => {
    const response = await fetchWorker("/models?limit=1", {
        headers: { Authorization: `Bearer ${restrictedApiKey}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { category: string }[];
    expect(body).toHaveLength(1);
    expect(RESTRICTED_TEST_CATEGORIES).toContain(body[0].category);
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
        allowedModels: ["image"],
        user: { packBalance: 100 },
    });

    const videoResponse = await fetchWorker("/video/test", {
        headers: { Authorization: `Bearer ${key}` },
    });

    expect(videoResponse.status).toBe(403);
});

test("filters OpenRouter text models by paid balance", async ({
    apiKey,
    paidApiKey,
}) => {
    const [freeResponse, paidResponse, generation] = await Promise.all([
        fetchWorker("/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
        }),
        fetchWorker("/v1/models", {
            headers: { Authorization: `Bearer ${paidApiKey}` },
        }),
        fetchWorker("/text/paid-only-check?model=mistral", {
            headers: { Authorization: `Bearer ${apiKey}` },
        }),
    ]);

    expect(freeResponse.status).toBe(200);
    expect(paidResponse.status).toBe(200);

    const freeModels = (await freeResponse.json()) as {
        data: { id: string }[];
    };
    const paidModels = (await paidResponse.json()) as {
        data: { id: string }[];
    };
    // Only the approved low-cost models are exempt from paid balance.
    const questPollenModels = new Set([
        "typesafe/jev-1.13",
        "jaredpalmer/kev-4b",
        "respan/span-01-lite",
    ]);
    const openRouterModelNames = getVisibleTextModels().filter((model) => {
        const definition = getRegistryModelDefinition(model);
        return (
            definition.provider === "openrouter" &&
            !questPollenModels.has(model)
        );
    });
    const freeModelNames = new Set(freeModels.data.map((model) => model.id));
    const paidModelNames = new Set(paidModels.data.map((model) => model.id));

    for (const model of questPollenModels) {
        expect(
            freeModelNames.has(model),
            `${model} visible to Quest Pollen`,
        ).toBe(true);
        expect(
            paidModelNames.has(model),
            `${model} visible to paid users`,
        ).toBe(true);
    }

    expect(openRouterModelNames.length).toBeGreaterThan(0);
    expect(
        openRouterModelNames.every((model) => !freeModelNames.has(model)),
    ).toBe(true);
    expect(
        openRouterModelNames.every((model) => paidModelNames.has(model)),
    ).toBe(true);

    expect(generation.status).toBe(TEXT_BALANCE_NOTICE_ENABLED ? 200 : 402);
    if (TEXT_BALANCE_NOTICE_ENABLED) {
        expect(await generation.text()).toContain(
            "?ref=agent_low_balance_topup",
        );
        expect(generation.headers.get("cache-control")).toBe(
            "private, no-store",
        );
    }
}, 15_000);

test("makes Azure GPT-6 models available to Quest Pollen accounts", async ({
    apiKey,
    paidApiKey,
}) => {
    const models = [
        "openai/gpt-6-sol",
        "openai/gpt-6.1-sol",
        "openai/gpt-6-luna",
    ] as const;
    const [freeResponse, paidResponse] = await Promise.all([
        fetchWorker("/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
        }),
        fetchWorker("/v1/models", {
            headers: { Authorization: `Bearer ${paidApiKey}` },
        }),
    ]);
    const freeModels = (await freeResponse.json()) as {
        data: { id: string }[];
    };
    const paidModels = (await paidResponse.json()) as {
        data: { id: string }[];
    };
    const freeNames = new Set(freeModels.data.map((model) => model.id));
    const paidNames = new Set(paidModels.data.map((model) => model.id));

    for (const model of models) {
        expect(freeNames.has(model)).toBe(true);
        expect(paidNames.has(model)).toBe(true);
        expect(getRegistryModelDefinition(model).paidOnly).toBe(false);
    }
}, 15_000);

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
    const [freeCatalog, paidCatalog, generation] = await Promise.all([
        fetchWorker("/image/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
        }),
        fetchWorker("/image/models", {
            headers: { Authorization: `Bearer ${paidApiKey}` },
        }),
        fetchWorker(
            "/image/paid-only-check?model=recraft-v4.1-vector&seed=24072499",
            { headers: { Authorization: `Bearer ${apiKey}` } },
        ),
    ]);
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

    expect(generation.status).toBe(402);
}, 15_000);

test("Scout catalog exposes its enforced output capabilities", async () => {
    const response = await fetchWorker("/models");
    const models = (await response.json()) as Record<string, unknown>[];
    expect(
        models.find((model) => model.name === "meta/llama-4-scout"),
    ).toMatchObject({
        tools: false,
        supports_structured_output: false,
        max_completion_tokens: 16384,
        context_length: 131072,
    });
});

test("MAI transcription allows Quest Pollen and hides its fallback route", async ({
    apiKey,
}) => {
    const modelDefinition = getRegistryModelDefinition(
        "microsoft/mai-transcribe-2",
    );
    expect(modelDefinition.paidOnly).toBe(false);
    expect(modelDefinition.priceMultiplier).toBe(0.75);
    for (const [model, status] of [
        ["microsoft/mai-transcribe-2", 400],
        ["microsoft/mai-transcribe-2:vercel", 400],
    ] as const) {
        const form = new FormData();
        form.set("model", model);
        form.set("response_format", "srt");
        form.set(
            "file",
            new File(["audio"], "test.wav", { type: "audio/wav" }),
        );
        const response = await fetchWorker("/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
        });
        expect(response.status, model).toBe(status);
        if (model === "microsoft/mai-transcribe-2:vercel") {
            const body = (await response.json()) as {
                error: { message: string };
            };
            expect(body.error.message).toContain("Invalid model or alias");
        } else {
            const body = (await response.json()) as {
                error: { message: string };
            };
            expect(body.error.message).toContain("response_format");
        }
    }
});
