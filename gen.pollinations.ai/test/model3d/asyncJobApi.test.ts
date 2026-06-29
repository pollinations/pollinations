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
import { afterEach, describe, expect } from "vitest";
import worker from "../../src/index.ts";

const INFERENCEPORT_HOST = "sharktide-lightning.hf.space";
const FAL_HOST = "queue.fal.run";

afterEach(async () => {
    await teardownFetchMock();
});

type InferenceportJobState = {
    status: "pending" | "processing" | "completed" | "failed";
    data?: { model_glb_b64_bytes?: string }[];
    error?: string;
};

function createInferenceportMock(): MockAPI<{
    jobs: Record<string, InferenceportJobState>;
    submitCount: number;
    failSubmits: boolean;
}> {
    const state = {
        jobs: {} as Record<string, InferenceportJobState>,
        submitCount: 0,
        failSubmits: false,
    };
    return {
        state,
        handlerMap: {
            [INFERENCEPORT_HOST]: async (request: Request) => {
                const url = new URL(request.url);
                if (
                    request.method === "POST" &&
                    url.pathname === "/v1/3d/generations"
                ) {
                    state.submitCount++;
                    if (state.failSubmits) {
                        return Response.json(
                            { detail: "down" },
                            { status: 500 },
                        );
                    }
                    const jobId = `ip_job_${state.submitCount}`;
                    state.jobs[jobId] = { status: "processing" };
                    return Response.json(
                        { job_id: jobId, status: "processing" },
                        {
                            status: 202,
                        },
                    );
                }
                const match = url.pathname.match(/^\/v1\/3d\/jobs\/(.+)$/);
                if (request.method === "GET" && match) {
                    const job = state.jobs[match[1]];
                    if (!job)
                        return Response.json(
                            { detail: "not found" },
                            { status: 404 },
                        );
                    return Response.json({ job_id: match[1], ...job });
                }
                return Response.json(
                    { detail: "unexpected request" },
                    { status: 404 },
                );
            },
        },
        reset: () => {
            state.jobs = {};
            state.submitCount = 0;
            state.failSubmits = false;
        },
    };
}

function createFalMock(): MockAPI<{ submitCount: number }> {
    const state = { submitCount: 0 };
    return {
        state,
        handlerMap: {
            [FAL_HOST]: async (request: Request) => {
                const url = new URL(request.url);
                if (request.method === "POST") {
                    state.submitCount++;
                    return Response.json(
                        {
                            request_id: "fal_req_1",
                            status_url: `https://${FAL_HOST}/fal-ai/triposr/requests/fal_req_1/status`,
                            response_url: `https://${FAL_HOST}/fal-ai/triposr/requests/fal_req_1`,
                        },
                        { status: 202 },
                    );
                }
                if (url.pathname.endsWith("/status")) {
                    return Response.json({ status: "COMPLETED" });
                }
                return Response.json({
                    model_mesh: { url: "https://v3.fal.media/files/model.glb" },
                });
            },
        },
        reset: () => {
            state.submitCount = 0;
        },
    };
}

const test = baseTest.extend<{
    mocks: ReturnType<typeof createMocks>;
}>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        const mocks = createMocks();
        await use(mocks);
    },
});

function createMocks() {
    return createFetchMock({
        tinybird: createMockTinybird(),
        inferenceport: createInferenceportMock(),
        fal: createFalMock(),
    });
}

async function fetchWorker(path: string, init: RequestInit = {}) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        env,
        ctx,
    );
    return { response, wait: () => waitOnExecutionContext(ctx) };
}

describe("async 3D job API", () => {
    test("submits a job and returns 202 with a pending job_id", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "inferenceport");

        const { response, wait } = await fetchWorker("/3d/generations", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "triposr",
                image: ["https://example.com/ref.jpg"],
            }),
        });
        const body = (await response.json()) as {
            job_id: string;
            status: string;
        };
        await wait();

        expect(response.status).toBe(202);
        expect(body.status).toBe("pending");
        expect(typeof body.job_id).toBe("string");
    });

    test("polls pending, then bills and returns the model once completed; re-serves without re-billing", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "inferenceport");

        const { response: submitResponse, wait: waitSubmit } =
            await fetchWorker("/3d/generations", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "triposr",
                    image: ["https://example.com/ref.jpg"],
                }),
            });
        const { job_id: jobId } = (await submitResponse.json()) as {
            job_id: string;
        };
        await waitSubmit();

        const { response: pendingResponse, wait: waitPending } =
            await fetchWorker(`/3d/jobs/${jobId}`, {
                headers: { authorization: `Bearer ${apiKey}` },
            });
        const pendingBody = (await pendingResponse.json()) as {
            status: string;
        };
        await waitPending();
        expect(pendingResponse.status).toBe(200);
        expect(pendingBody.status).toBe("pending");

        // Mark the upstream job completed before the next poll. The mock
        // keys jobs by inferenceport's own job id ("ip_job_N"), not our
        // job_id — this is the first (only) submission in this test.
        mocks.inferenceport.state.jobs.ip_job_1 = {
            status: "completed",
            data: [{ model_glb_b64_bytes: "aW5mZXJlbmNlcG9ydA==" }],
        };

        const { response: completedResponse, wait: waitCompleted } =
            await fetchWorker(`/3d/jobs/${jobId}`, {
                headers: { authorization: `Bearer ${apiKey}` },
            });
        await completedResponse.arrayBuffer();
        await waitCompleted();
        expect(completedResponse.status).toBe(200);
        expect(completedResponse.headers.get("content-type")).toBe(
            "model/gltf-binary",
        );
        expect(completedResponse.headers.get("x-model-used")).toBe("triposr");

        const billedEvents = mocks.tinybird.state.events.filter(
            (e) => e.isBilledUsage,
        );
        expect(billedEvents).toHaveLength(1);
        expect(billedEvents[0]?.resolvedModelRequested).toBe("triposr");

        // Re-poll the now-completed job: served from cache, not re-billed.
        const { response: replayResponse, wait: waitReplay } =
            await fetchWorker(`/3d/jobs/${jobId}`, {
                headers: { authorization: `Bearer ${apiKey}` },
            });
        await replayResponse.arrayBuffer();
        await waitReplay();
        expect(replayResponse.status).toBe(200);
        expect(replayResponse.headers.get("content-type")).toBe(
            "model/gltf-binary",
        );
        expect(
            mocks.tinybird.state.events.filter((e) => e.isBilledUsage),
        ).toHaveLength(1);
    });

    test("returns 404 for an unknown job_id", async ({ apiKey, mocks }) => {
        await mocks.enable("tinybird");

        const { response, wait } = await fetchWorker(
            "/3d/jobs/does-not-exist",
            { headers: { authorization: `Bearer ${apiKey}` } },
        );
        await wait();

        expect(response.status).toBe(404);
    });

    test("falls back to fal.ai at submission when inferenceport submit fails", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "inferenceport", "fal");
        mocks.inferenceport.state.failSubmits = true;

        const { response, wait } = await fetchWorker("/3d/generations", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "triposr",
                image: ["https://example.com/ref.jpg"],
            }),
        });
        const body = (await response.json()) as { status: string };
        await wait();

        expect(response.status).toBe(202);
        expect(body.status).toBe("pending");
        expect(mocks.fal.state.submitCount).toBe(1);
    });
});
