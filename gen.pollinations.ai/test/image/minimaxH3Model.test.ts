import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callMinimaxH3API } from "../../src/image/models/minimaxH3Model.ts";
import type { ImageParams } from "../../src/image/params.ts";

const H3_ENDPOINT = "https://queue.fal.run/minimax/h3/text-to-video";
const STATUS_URL = "https://queue.fal.run/minimax/h3/requests/test/status";
const RESULT_URL = "https://queue.fal.run/minimax/h3/requests/test";
const VIDEO_URL = "https://fal.media/minimax-h3-test.mp4";
const VIDEO_BYTES = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]);

const baseParams: ImageParams = {
    model: "minimax-h3",
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
    aspectRatio: "16:9",
};

type ProviderRequest = {
    url: string;
    body?: Record<string, unknown>;
};

function mockH3Fetch(
    requests: ProviderRequest[],
    status: "COMPLETED" | "FAILED" = "COMPLETED",
) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            requests.push({
                url: href,
                body: init?.body
                    ? (JSON.parse(init.body as string) as Record<
                          string,
                          unknown
                      >)
                    : undefined,
            });
            if (href === H3_ENDPOINT) {
                return Response.json({
                    status_url: STATUS_URL,
                    response_url: RESULT_URL,
                });
            }
            if (href === STATUS_URL) {
                return Response.json({
                    status,
                    error: "provider rejected prompt",
                });
            }
            if (href === RESULT_URL) {
                return Response.json({
                    video: { url: VIDEO_URL, content_type: "video/mp4" },
                });
            }
            if (href === VIDEO_URL) {
                return new Response(VIDEO_BYTES, {
                    headers: { "Content-Type": "video/mp4" },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });
}

beforeEach(() => {
    syncImageEnv({ FAL_KEY: "test-fal-key" } as CloudflareBindings, [
        "FAL_KEY",
    ]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("callMinimaxH3API", () => {
    it.each([
        [undefined, "480P"],
        ["480p", "480P"],
        ["768p", "768P"],
        ["2k", "2K"],
    ] as const)("routes resolution %s as %s", async (resolution, expected) => {
        const requests: ProviderRequest[] = [];
        mockH3Fetch(requests);

        const result = await callMinimaxH3API("a red wind-up robot", {
            ...baseParams,
            resolution,
        });

        expect(requests[0]).toEqual({
            url: H3_ENDPOINT,
            body: {
                prompt: "a red wind-up robot",
                duration: 5,
                resolution: expected,
                aspect_ratio: "16:9",
            },
        });
        expect(result.buffer).toEqual(Buffer.from(VIDEO_BYTES));
        expect(result.mimeType).toBe("video/mp4");
        expect(result.durationSeconds).toBe(5);
        expect(result.trackingData).toEqual({
            actualModel: "minimax-h3",
            usage: { completionVideoSeconds: 5 },
        });
    });

    it("surfaces a terminal provider failure", async () => {
        mockH3Fetch([], "FAILED");

        await expect(
            callMinimaxH3API("a rejected prompt", baseParams),
        ).rejects.toMatchObject({
            status: 502,
            message: "provider rejected prompt",
        });
    });
});
