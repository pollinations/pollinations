import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as baseTest } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { afterEach, describe, expect } from "vitest";
import worker from "../../src/index.ts";
import { resetGenerationModelRegistryCache } from "../../src/model-registry.ts";
import { MODERATION_CATEGORIES } from "../../src/schemas/moderations.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const TEST_MODERATION_MODEL = "qwen-safety";
const PORTKEY_HOST = "portkey.test";
const TINYBIRD_STATS_HOST = "api.europe-west2.gcp.tinybird.co";

function buildVerdict(flagged: boolean) {
    const categories = Object.fromEntries(
        MODERATION_CATEGORIES.map((category) => [
            category,
            flagged && category === "violence",
        ]),
    );
    const category_scores = Object.fromEntries(
        MODERATION_CATEGORIES.map((category) => [
            category,
            flagged && category === "violence" ? 0.9 : 0,
        ]),
    );
    return { flagged, is_safe: !flagged, categories, category_scores };
}

function createModerationMocks() {
    env.PORTKEY_GATEWAY_URL = `https://${PORTKEY_HOST}`;
    env.OVHCLOUD_API_KEY = "test-ovhcloud-key";
    process.env.OVHCLOUD_API_KEY = env.OVHCLOUD_API_KEY;

    const requests: Array<Record<string, unknown>> = [];
    return createFetchMock({
        tinybird: createMockTinybird(),
        tinybirdStats: {
            state: {},
            handlerMap: {
                [TINYBIRD_STATS_HOST]: async () => Response.json({ data: [] }),
            },
            reset: () => {},
        },
        portkey: {
            state: { requests },
            handlerMap: {
                [PORTKEY_HOST]: async (request) => {
                    const body = (await request.clone().json()) as {
                        model?: string;
                        messages?: Array<{ role?: string; content?: string }>;
                    };
                    requests.push(body);
                    const userContent =
                        body.messages?.find((m) => m.role === "user")
                            ?.content ?? "";
                    const flagged = userContent.includes("kill");
                    return Response.json({
                        id: "chatcmpl_moderation_test",
                        object: "chat.completion",
                        created: 1,
                        model: body.model,
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: "assistant",
                                    content: JSON.stringify(
                                        buildVerdict(flagged),
                                    ),
                                },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 5,
                            total_tokens: 15,
                        },
                    });
                },
            },
            reset: () => {
                requests.length = 0;
            },
        },
    });
}

const test = baseTest.extend<{
    mocks: ReturnType<typeof createModerationMocks>;
}>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        const mocks = createModerationMocks();
        await use(mocks);
    },
});

afterEach(async () => {
    await teardownFetchMock();
    resetGenerationModelRegistryCache();
});

async function fetchWorker(path: string, init: RequestInit) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        withInlineGenerationCoordinator(env),
        ctx,
    );
    return {
        response,
        wait: () => waitOnExecutionContext(ctx),
    };
}

function buildModerationBody(extra: Record<string, unknown> = {}) {
    return JSON.stringify({
        model: TEST_MODERATION_MODEL,
        input: "Just a normal message",
        ...extra,
    });
}

describe("/v1/moderations", () => {
    test("classifies a safe input with an OpenAI-compatible response", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "portkey");
        const { response, wait } = await fetchWorker("/v1/moderations", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildModerationBody(),
        });

        const body = await response.text();
        expect(response.status, body).toBe(200);
        const data = JSON.parse(body) as {
            id: string;
            model: string;
            results: Array<{
                flagged: boolean;
                categories: Record<string, boolean>;
            }>;
        };
        expect(data.id).toMatch(/^modr_/);
        expect(data.model).toBe(TEST_MODERATION_MODEL);
        expect(data.results).toHaveLength(1);
        expect(data.results[0].flagged).toBe(false);
        expect(data.results[0].categories).toMatchObject(
            Object.fromEntries(MODERATION_CATEGORIES.map((c) => [c, false])),
        );
        expect(response.headers.get("x-model-used")).toBe(
            TEST_MODERATION_MODEL,
        );
        expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("10");
        expect(response.headers.get("x-usage-completion-text-tokens")).toBe(
            "5",
        );

        await wait();
        const events = mocks.tinybird.state.events;
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            eventType: "generate.moderation",
            modelRequested: TEST_MODERATION_MODEL,
            resolvedModelRequested: TEST_MODERATION_MODEL,
            modelUsed: TEST_MODERATION_MODEL,
            tokenCountPromptText: 10,
            tokenCountCompletionText: 5,
            isBilledUsage: true,
        });
        expect(events[0].totalPrice).toBeGreaterThan(0);
    });

    test("flags a harmful input with per-category verdicts", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "portkey");
        const { response, wait } = await fetchWorker("/v1/moderations", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildModerationBody({ input: "I want to kill everyone" }),
        });

        expect(response.status).toBe(200);
        const data = (await response.json()) as {
            results: Array<{
                flagged: boolean;
                categories: Record<string, boolean>;
                category_scores: Record<string, number>;
            }>;
        };
        expect(data.results[0].flagged).toBe(true);
        expect(data.results[0].categories.violence).toBe(true);
        expect(data.results[0].categories.hate).toBe(false);
        expect(data.results[0].category_scores.violence).toBe(0.9);
        await wait();
    });

    test("returns one result per array input", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "portkey");
        const { response, wait } = await fetchWorker("/v1/moderations", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildModerationBody({
                input: ["Just a normal message", "I will kill you"],
            }),
        });

        expect(response.status).toBe(200);
        const data = (await response.json()) as {
            results: Array<{ flagged: boolean }>;
        };
        expect(data.results).toHaveLength(2);
        expect(data.results[0].flagged).toBe(false);
        expect(data.results[1].flagged).toBe(true);
        expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("20");
        await wait();
    });

    test("defaults to the moderation model when none is given", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "portkey");
        const { response, wait } = await fetchWorker("/v1/moderations", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ input: "Just a normal message" }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("x-model-used")).toBe(
            TEST_MODERATION_MODEL,
        );
        await response.arrayBuffer();
        await wait();
    });

    test("rejects a text model on the moderation endpoint", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "portkey");
        const { response, wait } = await fetchWorker("/v1/moderations", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildModerationBody({ model: "openai-fast" }),
        });

        expect(response.status).toBe(400);
        const data = (await response.json()) as {
            error?: { message?: string };
        };
        expect(data.error?.message).toContain("text model");
        await wait();
    });
});

describe("GET /moderations/models", () => {
    test("lists moderation models", async ({ paidApiKey: apiKey, mocks }) => {
        await mocks.enable("tinybird", "tinybirdStats", "portkey");
        const { response, wait } = await fetchWorker("/moderations/models", {
            headers: {
                authorization: `Bearer ${apiKey}`,
            },
        });

        expect(response.status).toBe(200);
        const data = (await response.json()) as Array<{ name: string }>;
        expect(data.some((model) => model.name === TEST_MODERATION_MODEL)).toBe(
            true,
        );
        await wait();
    });
});
