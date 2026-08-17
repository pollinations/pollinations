import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, vi } from "vitest";
import worker from "../src/index.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

type CapturedTransform = {
    resize?: MediaTransformationInputOptions;
    output?: MediaTransformationOutputOptions;
};

function createMediaBinding(
    captured: CapturedTransform,
    contentType = "video/mp4",
): MediaBinding {
    const result = {
        async response() {
            return new Response(new Uint8Array([4, 5, 6]), {
                headers: { "content-type": contentType },
            });
        },
    } as MediaTransformationResult;
    const generator = {
        output(options?: MediaTransformationOutputOptions) {
            captured.output = options;
            return result;
        },
    };

    return {
        input() {
            return {
                transform(options?: MediaTransformationInputOptions) {
                    captured.resize = options;
                    return generator;
                },
                output: generator.output,
            };
        },
    } as MediaBinding;
}

async function fetchGen(request: Request, media: MediaBinding) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        request,
        {
            ...withInlineGenerationCoordinator(env),
            MEDIA: media,
        },
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

describe("media transformations", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("transforms and meters a video clip at cost", async () => {
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 100 },
        });
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const url = String(input);
            if (url === "https://example.com/input.mp4") {
                return new Response(new Uint8Array([1, 2, 3]), {
                    headers: { "content-type": "video/mp4" },
                });
            }
            if (url.includes("public_model_stats.json")) {
                return Response.json({ data: [] });
            }
            return new Response(null, { status: 204 });
        });
        const captured: CapturedTransform = {};

        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/media/transforms", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${key}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    source: "https://example.com/input.mp4",
                    mode: "video",
                    time: 3,
                    duration: 5,
                    width: 720,
                    fit: "contain",
                    audio: false,
                }),
            }),
            createMediaBinding(captured),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("video/mp4");
        expect(response.headers.get("x-model-used")).toBe("media-transform");
        expect(response.headers.get("x-usage-completion-video-seconds")).toBe(
            "5",
        );
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(
            new Uint8Array([4, 5, 6]),
        );
        expect(captured.resize).toEqual({ width: 720, fit: "contain" });
        expect(captured.output).toEqual({
            mode: "video",
            time: "3s",
            duration: "5s",
            audio: false,
        });
        const user = await env.DB.prepare(
            "SELECT pack_balance FROM user WHERE id = ?",
        )
            .bind(userId)
            .first<{ pack_balance: number }>();
        expect(user?.pack_balance).toBeCloseTo(99.9975, 8);
    });

    test("requires duration for video and audio", async ({ paidApiKey }) => {
        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/media/transforms", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${paidApiKey}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    source: "https://example.com/input.mp4",
                    mode: "audio",
                }),
            }),
            createMediaBinding({}),
        );

        expect(response.status).toBe(400);
        expect(await response.text()).toContain(
            "duration is required for video and audio output",
        );
    });

    test("rejects a transform above the API key budget before fetching", async () => {
        const { key } = await createTestApiKey({
            pollenBudget: 0.001,
            user: { packBalance: 100 },
        });
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(null, { status: 204 }));
        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/media/transforms", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${key}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    source: "https://example.com/input.mp4",
                    mode: "video",
                    duration: 5,
                }),
            }),
            createMediaBinding({}),
        );

        expect(response.status).toBe(402);
        expect(
            fetchSpy.mock.calls.some(
                ([input]) => String(input) === "https://example.com/input.mp4",
            ),
        ).toBe(false);
    });

    test("does not bill a successful non-media response", async () => {
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 100 },
        });
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            if (String(input) === "https://example.com/input.mp4") {
                return new Response(new Uint8Array([1, 2, 3]));
            }
            return new Response(null, { status: 204 });
        });
        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/media/transforms", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${key}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    source: "https://example.com/input.mp4",
                    mode: "frame",
                }),
            }),
            createMediaBinding({}, "application/json"),
        );

        expect(response.status).toBe(502);
        const user = await env.DB.prepare(
            "SELECT pack_balance FROM user WHERE id = ?",
        )
            .bind(userId)
            .first<{ pack_balance: number }>();
        expect(user?.pack_balance).toBe(100);
    });

    test("rejects private source URLs before fetching", async ({
        paidApiKey,
    }) => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (input) => {
                if (String(input).includes("public_model_stats.json")) {
                    return Response.json({ data: [] });
                }
                return new Response(null, { status: 204 });
            });
        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/media/transforms", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${paidApiKey}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    source: "http://127.0.0.1/input.mp4",
                    mode: "frame",
                }),
            }),
            createMediaBinding({}),
        );

        expect(response.status).toBe(400);
        expect(
            fetchSpy.mock.calls.some(
                ([input]) => String(input) === "http://127.0.0.1/input.mp4",
            ),
        ).toBe(false);
    });
});
