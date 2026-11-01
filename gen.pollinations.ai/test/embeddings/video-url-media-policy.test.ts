import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as baseTest } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    type MockAPI,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import worker from "../../src/index.ts";
import googleCloudAuth from "../../src/text/auth/googleCloudAuth.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const TEST_EMBEDDING_MODEL = "google/gemini-embedding-2";
const VERTEX_HOST = "aiplatform.us.rep.googleapis.com";
const TINYBIRD_STATS_HOST = "api.europe-west2.gcp.tinybird.co";
const OVERSIZED_HOST = "big-media.example.test";

// 20 MiB is the platform-wide cap every other user-media fetch enforces
// (MAX_IMAGE_SIZE in gen.pollinations.ai/src/userImage.ts). 21 one-MiB chunks
// cross it without a content-length, so only the running byte count catches it.
const MEDIA_CAP_BYTES = 20 * 1024 * 1024;
const OVERSIZED_CHUNKS = MEDIA_CAP_BYTES / (1024 * 1024) + 1;

beforeEach(() => {
    vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue(
        "test-google-access-token",
    );
});

afterEach(async () => {
    await teardownFetchMock();
    vi.restoreAllMocks();
});

type RefusedHostState = {
    requests: { url: string; authorization: string | null }[];
};

function createRefusedHostsMock(): MockAPI<RefusedHostState> {
    const state: RefusedHostState = {
        requests: [],
    };
    return {
        state,
        handlerMap: {
            // Literal-IP, loopback-name, and credentialed hosts the shared
            // user-media URL policy refuses on every other media path.
            "169.254.169.254": handler(state),
            localhost: handler(state),
            "example.com": handler(state),
        },
        reset: () => {
            state.requests = [];
        },
    };
}

function handler(state: RefusedHostState) {
    return async (request: Request) => {
        state.requests.push({
            url: request.url,
            authorization: request.headers.get("authorization"),
        });
        return new Response("instance-metadata", {
            headers: { "content-type": "text/plain" },
        });
    };
}

type VertexState = {
    requests: {
        parts: Array<Record<string, unknown>>;
        inlineBytes: number;
    }[];
};

function createVertexMock(): MockAPI<VertexState> {
    const state: VertexState = { requests: [] };
    return {
        state,
        handlerMap: {
            [VERTEX_HOST]: async (request) => {
                const body = (await request.json()) as {
                    content?: { parts?: Array<Record<string, unknown>> };
                };
                const parts =
                    (body.content?.parts as
                        | Array<{ inlineData?: { data?: unknown } }>
                        | undefined) ?? [];
                state.requests.push({
                    parts,
                    inlineBytes: parts.reduce(
                        (total, part) =>
                            total +
                            (typeof part.inlineData?.data === "string"
                                ? part.inlineData.data.length
                                : 0),
                        0,
                    ),
                });
                return Response.json({
                    embedding: {
                        values: [0, 0.1, 0.2],
                    },
                    usageMetadata: {
                        promptTokenCount: 5,
                        totalTokenCount: 5,
                        promptTokensDetails: [
                            { modality: "VIDEO", tokenCount: 5 },
                        ],
                    },
                });
            },
        },
        reset: () => {
            state.requests = [];
        },
    };
}

type OversizedState = { requests: number };

function createOversizedMock(): MockAPI<OversizedState> {
    const state: OversizedState = { requests: 0 };
    return {
        state,
        handlerMap: {
            [OVERSIZED_HOST]: async () => {
                state.requests += 1;
                return new Response(
                    new ReadableStream({
                        start(controller) {
                            const chunk = new Uint8Array(1024 * 1024).fill(65);
                            for (
                                let index = 0;
                                index < OVERSIZED_CHUNKS;
                                index += 1
                            ) {
                                controller.enqueue(chunk);
                            }
                            controller.close();
                        },
                    }),
                    { headers: { "content-type": "video/mp4" } },
                );
            },
        },
        reset: () => {
            state.requests = 0;
        },
    };
}

type EmbeddingPolicyMocks = {
    tinybird: ReturnType<typeof createMockTinybird>;
    tinybirdStats: MockAPI<Record<string, never>>;
    refusedHosts: ReturnType<typeof createRefusedHostsMock>;
    vertex: ReturnType<typeof createVertexMock>;
    oversized: ReturnType<typeof createOversizedMock>;
};

const test = baseTest.extend<{
    mocks: {
        enable: (...names: (keyof EmbeddingPolicyMocks)[]) => Promise<void>;
        refusedHosts: EmbeddingPolicyMocks["refusedHosts"];
        vertex: EmbeddingPolicyMocks["vertex"];
        oversized: EmbeddingPolicyMocks["oversized"];
    };
}>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        env.GOOGLE_PROJECT_ID = "test-project";
        process.env.GOOGLE_PROJECT_ID = env.GOOGLE_PROJECT_ID;
        const refusedHosts = createRefusedHostsMock();
        const vertex = createVertexMock();
        const oversized = createOversizedMock();
        const mock = createFetchMock<EmbeddingPolicyMocks>({
            tinybird: createMockTinybird(),
            tinybirdStats: {
                state: {},
                handlerMap: {
                    [TINYBIRD_STATS_HOST]: async () =>
                        Response.json({ data: [] }),
                },
                reset: () => {},
            } satisfies MockAPI<Record<string, never>>,
            refusedHosts,
            vertex,
            oversized,
        });
        await use({
            enable: mock.enable,
            refusedHosts,
            vertex,
            oversized,
        });
    },
});

async function fetchWorker(path: string, init: RequestInit = {}) {
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

function videoUrlBody(url: string) {
    return JSON.stringify({
        model: TEST_EMBEDDING_MODEL,
        input: [
            {
                type: "video_url",
                video_url: { url },
            },
        ],
    });
}

describe("POST /v1/embeddings video_url media policy", () => {
    test.for([
        ["http://169.254.169.254/latest/meta-data", "literal IP host"],
        ["http://localhost/latest/meta-data", "loopback host"],
        ["http://user:pass@example.com/video.mp4", "credentialed URL"],
    ] as const)(
        "refuses a video_url pointing at a %s without fetching it",
        async ([url], { paidApiKey: apiKey, mocks }) => {
            await mocks.enable(
                "tinybird",
                "tinybirdStats",
                "vertex",
                "refusedHosts",
            );
            const { response, wait } = await fetchWorker("/v1/embeddings", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${apiKey}`,
                },
                body: videoUrlBody(url),
            });

            let body = "";
            try {
                body = await response.text();
                expect(response.status).toBe(400);
                expect(body).toMatch(/private or credentialed/i);

                // The refused URL is never fetched and the provider is never
                // called.
                expect(mocks.refusedHosts.state.requests).toEqual([]);
                expect(mocks.vertex.state.requests).toEqual([]);
            } finally {
                await wait();
            }
        },
    );

    test("rejects a video_url response above the 20 MiB user-media cap", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "vertex", "oversized");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: videoUrlBody(`http://${OVERSIZED_HOST}/video.mp4`),
        });

        let body = "";
        try {
            body = await response.text();
            expect(response.status).toBe(400);
            expect(body).toMatch(/too large/i);

            expect(mocks.oversized.state.requests).toBe(1);
            // The provider never receives the uncapped bytes.
            expect(mocks.vertex.state.requests).toEqual([]);
        } finally {
            await wait();
        }
    });

    test("keeps refusing a literal-IP image_url (existing policy)", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable(
            "tinybird",
            "tinybirdStats",
            "vertex",
            "refusedHosts",
        );
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: TEST_EMBEDDING_MODEL,
                input: [
                    {
                        type: "image_url",
                        image_url: {
                            url: "http://169.254.169.254/latest/meta-data",
                        },
                    },
                ],
            }),
        });

        try {
            await response.text();
            expect(response.status).toBe(400);
            expect(mocks.refusedHosts.state.requests).toEqual([]);
            expect(mocks.vertex.state.requests).toEqual([]);
        } finally {
            await wait();
        }
    });
});
