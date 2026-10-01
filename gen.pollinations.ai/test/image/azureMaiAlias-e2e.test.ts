import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { apikey, user as userTable } from "@shared/db/better-auth.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const oldModel = "microsoft/mai-image-2.5-flash";
const currentModel = "microsoft/mai-image-2.6-flash";
const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==";

afterEach(async () => {
    await teardownFetchMock();
});

test("old MAI ID with a stored restricted key uses 2.6 routing and billing", async () => {
    const { key, id, userId } = await createTestApiKey({
        allowedModels: [currentModel],
        user: { packBalance: 100 },
    });
    await drizzle(env.DB)
        .update(apikey)
        .set({ permissions: JSON.stringify({ models: [oldModel] }) })
        .where(eq(apikey.id, id));

    syncImageEnv(
        { AZURE_MYCELI_PROD_API_KEY: "test-azure-key" } as CloudflareBindings,
        ["AZURE_MYCELI_PROD_API_KEY"],
    );
    const requests: Record<string, unknown>[] = [];
    const mocks = createFetchMock({
        tinybird: createMockTinybird(),
        contentSafety: {
            state: {},
            handlerMap: {
                "content-safety.test": async () =>
                    Response.json({ categoriesAnalysis: [] }),
            },
            reset: () => {},
        },
        azure: {
            state: requests,
            handlerMap: {
                "myceli-prod-eastus.services.ai.azure.com": async (
                    request: Request,
                ) => {
                    expect(new URL(request.url).pathname).toBe(
                        "/mai/v1/images/generations",
                    );
                    requests.push(
                        (await request.json()) as Record<string, unknown>,
                    );
                    return Response.json({
                        data: [{ b64_json: pngBase64 }],
                        usage: {
                            num_input_text_tokens: 24,
                            num_input_image_tokens: 0,
                            num_output_tokens: 960,
                        },
                    });
                },
            },
            reset: () => {
                requests.length = 0;
            },
        },
    });
    await mocks.enable("tinybird", "contentSafety", "azure");

    const context = createExecutionContext();
    const response = await worker.fetch(
        new Request(
            `https://gen.pollinations.ai/image/a%20red%20bicycle?model=${oldModel}&width=1280&height=768&seed=42`,
            { headers: { authorization: `Bearer ${key}` } },
        ),
        withInlineGenerationCoordinator(env),
        context,
    );
    const failureBody =
        response.status === 200 ? "" : await response.clone().text();
    expect(response.status, failureBody).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^image\//);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(response.headers.get("x-model-used")).toBe(currentModel);
    expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("24");
    expect(response.headers.get("x-usage-completion-image-tokens")).toBe("960");
    await waitOnExecutionContext(context);

    expect(requests).toEqual([
        {
            model: "MAI-Image-2.6-Flash",
            prompt: "a red bicycle",
            width: 1280,
            height: 768,
        },
    ]);
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.image",
        modelRequested: oldModel,
        resolvedModelRequested: currentModel,
        modelUsed: currentModel,
        tokenCountPromptText: 24,
        tokenCountCompletionImage: 960,
        totalCost: 0.018282,
        totalPrice: 0.0137115,
        isBilledUsage: true,
    });
    const [user] = await drizzle(env.DB)
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, userId));
    expect(user.packBalance).toBeCloseTo(100 - 0.0137115, 8);
});
