import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callGeminiOmniAPI } from "../../src/image/models/geminiOmniVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";
import googleCloudAuth from "../../src/text/auth/googleCloudAuth.ts";

const FIRST_FRAME_URL = "https://image.example.com/first.png";
const LAST_FRAME_URL = "https://image.example.com/last.png";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const VIDEO_BYTES = Buffer.from("gemini-omni-video");

const baseParams: ImageParams = {
    model: "google/gemini-omni-1.1-flash",
    width: 1024,
    height: 1024,
    dimensionsExplicit: false,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: false,
    duration: 5,
};

function setGoogleEnv() {
    syncImageEnv({ GOOGLE_PROJECT_ID: "test-project" } as CloudflareBindings, [
        "GOOGLE_PROJECT_ID",
    ]);
    vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue("test-token");
}

function mockGeminiOmniFetch(requests: Array<Record<string, unknown>>) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href === FIRST_FRAME_URL || href === LAST_FRAME_URL) {
                return new Response(PNG_BYTES, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            if (href.endsWith("/locations/global/interactions")) {
                requests.push(
                    JSON.parse(init?.body as string) as Record<string, unknown>,
                );
                return Response.json({
                    status: "completed",
                    usage: {
                        total_tokens: 10_100,
                        input_tokens_by_modality: [
                            { modality: "text", tokens: 20 },
                            { modality: "image", tokens: 2_240 },
                        ],
                        output_tokens_by_modality: [
                            { modality: "video", tokens: 9_655 },
                        ],
                        total_thought_tokens: 425,
                    },
                    steps: [
                        {
                            type: "model_output",
                            content: [
                                {
                                    type: "video",
                                    mime_type: "video/mp4",
                                    data: VIDEO_BYTES.toString("base64"),
                                },
                            ],
                        },
                    ],
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("geminiOmniVideoModel", () => {
    it.each([
        [undefined, "720p"],
        ["360p", "360p"],
        ["720p", "720p"],
        ["1080p", "1080p"],
        ["4k", "4k"],
    ] as const)("forwards resolution %s as %s", async (requested, expected) => {
        setGoogleEnv();
        const requests: Array<Record<string, unknown>> = [];
        mockGeminiOmniFetch(requests);

        const result = await callGeminiOmniAPI("a calm ocean", {
            ...baseParams,
            resolution: requested,
        });

        expect(requests[0]).toMatchObject({
            model: "gemini-omni-1.1-flash-preview",
            store: false,
            generation_config: {
                video_config: { task: "text_to_video" },
            },
            response_format: [
                {
                    type: "video",
                    aspect_ratio: "16:9",
                    resolution: expected,
                    duration: "5s",
                },
            ],
        });
        expect(result.buffer).toEqual(VIDEO_BYTES);
        expect(result.trackingData).toEqual({
            actualModel: "google/gemini-omni-1.1-flash",
            usage: {
                promptTextTokens: 20,
                promptImageTokens: 2240,
                completionVideoTokens: 9655,
                completionReasoningTokens: 425,
                totalTokenCount: 10100,
            },
        });
    });

    it("sends two frame images in order and honors portrait output", async () => {
        setGoogleEnv();
        const requests: Array<Record<string, unknown>> = [];
        mockGeminiOmniFetch(requests);

        await callGeminiOmniAPI("transition between these frames", {
            ...baseParams,
            image: [FIRST_FRAME_URL, LAST_FRAME_URL],
            aspectRatio: "9:16",
        });

        expect(requests[0]).toMatchObject({
            input: [
                { type: "text", text: "transition between these frames" },
                {
                    type: "image",
                    data: Buffer.from(PNG_BYTES).toString("base64"),
                    mime_type: "image/png",
                },
                {
                    type: "image",
                    data: Buffer.from(PNG_BYTES).toString("base64"),
                    mime_type: "image/png",
                },
            ],
            generation_config: {
                video_config: { task: "image_to_video" },
            },
            response_format: [{ aspect_ratio: "9:16" }],
        });
    });

    it.each([
        [1024, 1024, "16:9"],
        [1280, 720, "16:9"],
        [720, 1280, "9:16"],
    ] as const)("maps explicit %sx%s dimensions to %s", async (width, height, aspectRatio) => {
        setGoogleEnv();
        const requests: Array<Record<string, unknown>> = [];
        mockGeminiOmniFetch(requests);

        await callGeminiOmniAPI("test", {
            ...baseParams,
            width,
            height,
            dimensionsExplicit: true,
        });

        expect(requests[0]).toMatchObject({
            response_format: [{ aspect_ratio: aspectRatio }],
        });
    });

    it("rejects unsupported duration and FPS before calling Vertex", async () => {
        setGoogleEnv();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        for (const params of [
            { duration: 2 },
            { duration: 3.5 },
            { fps: 30 },
        ]) {
            await expect(
                callGeminiOmniAPI("test", { ...baseParams, ...params }),
            ).rejects.toMatchObject({ status: 400 });
        }
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns 502 when Vertex completes without video data", async () => {
        setGoogleEnv();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ status: "completed", steps: [] }),
        );

        await expect(
            callGeminiOmniAPI("test", baseParams),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("returns 502 when Vertex omits billable video usage", async () => {
        setGoogleEnv();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                status: "completed",
                steps: [
                    {
                        content: [
                            {
                                type: "video",
                                mime_type: "video/mp4",
                                data: VIDEO_BYTES.toString("base64"),
                            },
                        ],
                    },
                ],
            }),
        );

        await expect(
            callGeminiOmniAPI("test", baseParams),
        ).rejects.toMatchObject({ status: 502 });
    });
});
