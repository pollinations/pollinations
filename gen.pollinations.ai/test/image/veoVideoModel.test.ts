import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callVeoAPI } from "../../src/image/models/veoVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";
import googleCloudAuth from "../../src/text/auth/googleCloudAuth.ts";

const FIRST_FRAME_URL = "https://image.example.com/first.png";
const LAST_FRAME_URL = "https://image.example.com/last.png";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const baseParams: ImageParams = {
    model: "google/veo-3.1-fast",
    width: 1280,
    height: 720,
    dimensionsExplicit: true,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: true,
    duration: 4,
};

function mockVeoFetch(requests: Array<Record<string, unknown>>) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href === FIRST_FRAME_URL || href === LAST_FRAME_URL) {
                return new Response(PNG_BYTES, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            if (href.endsWith(":predictLongRunning")) {
                requests.push(
                    JSON.parse(init?.body as string) as Record<string, unknown>,
                );
                return Response.json({
                    name: "projects/test/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/test-operation",
                });
            }
            if (href.endsWith(":fetchPredictOperation")) {
                return Response.json({
                    done: true,
                    response: {
                        videos: [
                            {
                                bytesBase64Encoded:
                                    Buffer.from("test-video").toString(
                                        "base64",
                                    ),
                                mimeType: "video/mp4",
                            },
                        ],
                    },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });
}

function setGoogleEnv() {
    syncImageEnv({ GOOGLE_PROJECT_ID: "test-project" } as CloudflareBindings, [
        "GOOGLE_PROJECT_ID",
    ]);
    vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue("test-token");
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("veoVideoModel resolution selection", () => {
    it("defaults veo to 720p and omits audio usage when disabled", async () => {
        setGoogleEnv();
        const requests: Array<Record<string, unknown>> = [];
        mockVeoFetch(requests);

        const result = await callVeoAPI("a calm ocean at sunrise", {
            ...baseParams,
            width: 1920,
            height: 1080,
            audio: false,
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].parameters).toMatchObject({
            resolution: "720p",
            generateAudio: false,
        });
        expect(result.trackingData).toEqual({
            actualModel: "google/veo-3.1-fast",
            usage: { completionVideoSeconds: 4 },
        });
    });

    it("passes an explicit 1080p resolution and reports enabled audio", async () => {
        setGoogleEnv();
        const requests: Array<Record<string, unknown>> = [];
        mockVeoFetch(requests);

        const result = await callVeoAPI("a calm ocean at sunrise", {
            ...baseParams,
            resolution: "1080p",
            width: 1280,
            height: 720,
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].parameters).toMatchObject({
            resolution: "1080p",
            generateAudio: true,
        });
        expect(result.trackingData).toEqual({
            actualModel: "google/veo-3.1-fast",
            usage: {
                completionVideoSeconds: 4,
                completionAudioSeconds: 4,
            },
        });
    });

    it("maps the first and second images to Veo start and end frames", async () => {
        setGoogleEnv();
        const requests: Array<Record<string, unknown>> = [];
        mockVeoFetch(requests);

        await callVeoAPI("move between these frames", {
            ...baseParams,
            image: [FIRST_FRAME_URL, LAST_FRAME_URL],
        });

        expect(requests[0]).toMatchObject({
            instances: [
                {
                    image: {
                        bytesBase64Encoded:
                            Buffer.from(PNG_BYTES).toString("base64"),
                        mimeType: "image/png",
                    },
                    lastFrame: {
                        bytesBase64Encoded:
                            Buffer.from(PNG_BYTES).toString("base64"),
                        mimeType: "image/png",
                    },
                },
            ],
        });
    });
});
