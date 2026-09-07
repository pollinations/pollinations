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
import { afterEach, expect } from "vitest";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

function createAssemblyAiMock() {
    const state: { submitted?: Record<string, unknown> } = {};
    return {
        state,
        handlerMap: {
            "api.assemblyai.com": async (request: Request) => {
                const { pathname } = new URL(request.url);
                if (pathname === "/v2/upload") {
                    return Response.json({
                        upload_url: "https://cdn.assemblyai.com/upload/test",
                    });
                }
                if (
                    pathname === "/v2/transcript" &&
                    request.method === "POST"
                ) {
                    state.submitted = (await request.json()) as Record<
                        string,
                        unknown
                    >;
                    return Response.json({ id: "transcript-id" });
                }
                if (pathname === "/v2/transcript/transcript-id") {
                    return Response.json({
                        id: "transcript-id",
                        status: "completed",
                        text: "Hello from AssemblyAI.",
                        audio_duration: 3600,
                        language_code: "en",
                        words: [],
                        utterances: [
                            {
                                text: "Hello from AssemblyAI.",
                                start: 0,
                                end: 1000,
                                speaker: "A",
                            },
                        ],
                    });
                }
                return new Response("Unexpected AssemblyAI request", {
                    status: 404,
                });
            },
        },
        reset: () => {
            state.submitted = undefined;
        },
    };
}

function createAssemblyAiPricingMocks() {
    return createFetchMock({
        assemblyai: createAssemblyAiMock(),
        tinybird: createMockTinybird(),
    });
}

const test = baseTest.extend<{
    mocks: ReturnType<typeof createAssemblyAiPricingMocks>;
}>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        await use(createAssemblyAiPricingMocks());
    },
});

afterEach(async () => {
    await teardownFetchMock();
});

test("AssemblyAI prompt and diarization select the combined billing sheet", async ({
    apiKey,
    mocks,
}) => {
    await mocks.enable("assemblyai", "tinybird");

    const form = new FormData();
    form.set("model", "universal-3.5-pro");
    form.set("prompt", "Pollinations pricing verification");
    form.set("response_format", "diarized_json");
    form.set(
        "file",
        new File(["assemblyai-pricing-e2e"], "pricing.wav", {
            type: "audio/wav",
        }),
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/v1/audio/transcriptions", {
            method: "POST",
            headers: { authorization: `Bearer ${apiKey}` },
            body: form,
        }),
        withInlineGenerationCoordinator({
            ...env,
            ASSEMBLYAI_API_KEY: "assemblyai-test-key",
        } as CloudflareBindings),
        ctx,
    );
    expect(response.status, await response.clone().text()).toBe(200);
    await response.arrayBuffer();
    await waitOnExecutionContext(ctx);

    expect(mocks.assemblyai.state.submitted).toMatchObject({
        speech_models: ["universal-3-5-pro"],
        prompt: "Pollinations pricing verification",
        speaker_labels: true,
    });
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelRequested: "universal-3.5-pro",
        modelUsed: "assemblyai/universal-3.5-pro",
        costVariant: "prompting_diarization",
        tokenCountPromptAudioSeconds: 3600,
        tokenPricePromptAudioSeconds: 0.28 / 3600,
        totalCost: 0.28,
        totalPrice: 0.28,
    });
});
