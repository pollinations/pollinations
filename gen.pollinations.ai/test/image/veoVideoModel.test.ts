import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callVeo1080pAPI,
    callVeoAPI,
} from "../../src/image/models/veoVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";
import googleCloudAuth from "../../src/text/auth/googleCloudAuth.ts";

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

describe("veoVideoModel fixed-resolution tiers", () => {
    it("locks veo to 720p and omits audio usage when disabled", async () => {
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

    it("locks veo-1080p to 1080p and reports enabled audio", async () => {
        setGoogleEnv();
        const requests: Array<Record<string, unknown>> = [];
        mockVeoFetch(requests);

        const result = await callVeo1080pAPI("a calm ocean at sunrise", {
            ...baseParams,
            model: "veo-1080p",
            width: 1280,
            height: 720,
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].parameters).toMatchObject({
            resolution: "1080p",
            generateAudio: true,
        });
        expect(result.trackingData).toEqual({
            actualModel: "veo-1080p",
            usage: {
                completionVideoSeconds: 4,
                completionAudioSeconds: 4,
            },
        });
    });
});
