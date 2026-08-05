import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callKreaImageAPI,
    resolveKreaAspectRatio,
} from "../../src/image/models/kreaModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const KREA_ENDPOINT = "https://queue.fal.run/krea/v2/medium/text-to-image";
const STATUS_URL = "https://queue.fal.run/krea/requests/test/status";
const RESULT_URL = "https://queue.fal.run/krea/requests/test";
const IMAGE_URL = "https://fal.media/krea-output.png";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const baseParams: ImageParams = {
    model: "krea",
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
};

beforeEach(() => {
    syncImageEnv({ FAL_KEY: "test-fal-key" } as CloudflareBindings, [
        "FAL_KEY",
    ]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("callKreaImageAPI", () => {
    it("generates through the fal queue and tracks one image", async () => {
        const requests: Array<{ url: string; body?: Record<string, unknown> }> =
            [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
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
            if (href === KREA_ENDPOINT) {
                return new Response(
                    JSON.stringify({
                        status_url: STATUS_URL,
                        response_url: RESULT_URL,
                    }),
                    { status: 200 },
                );
            }
            if (href === STATUS_URL) {
                return new Response(JSON.stringify({ status: "COMPLETED" }), {
                    status: 200,
                });
            }
            if (href === RESULT_URL) {
                return new Response(
                    JSON.stringify({
                        images: [{ url: IMAGE_URL, content_type: "image/png" }],
                        seed: 42,
                    }),
                    { status: 200 },
                );
            }
            if (href === IMAGE_URL) {
                return new Response(PNG_BYTES, {
                    status: 200,
                    headers: { "Content-Type": "image/png" },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });

        const result = await callKreaImageAPI("a red apple", {
            ...baseParams,
            width: 1600,
            height: 900,
            seed: 123,
        });

        expect(requests).toHaveLength(4);
        expect(requests[0]).toEqual({
            url: KREA_ENDPOINT,
            body: {
                prompt: "a red apple",
                aspect_ratio: "16:9",
                creativity: "medium",
                seed: 123,
            },
        });
        expect(requests.slice(1).map(({ url }) => url)).toEqual([
            STATUS_URL,
            RESULT_URL,
            IMAGE_URL,
        ]);
        expect(result.buffer).toEqual(Buffer.from(PNG_BYTES));
        expect(result.mimeType).toBe("image/png");
        expect(result.trackingData).toEqual({
            actualModel: "krea",
            usage: { completionImageTokens: 1 },
        });
    });

    it("maps public aspect ratios to the closest supported Krea ratio", () => {
        expect(
            resolveKreaAspectRatio({
                ...baseParams,
                aspectRatio: "21:9",
            }),
        ).toBe("2.35:1");
        expect(
            resolveKreaAspectRatio({
                ...baseParams,
                aspectRatio: "3:4",
            }),
        ).toBe("4:5");
        expect(
            resolveKreaAspectRatio({
                ...baseParams,
                aspectRatio: "adaptive",
                width: 800,
                height: 1200,
            }),
        ).toBe("2:3");
    });

    it("rejects image input instead of silently ignoring it", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callKreaImageAPI("restyle this", {
                ...baseParams,
                image: ["https://example.com/style.png"],
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects malformed upstream responses", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response("not json", { status: 200 }),
        );

        await expect(
            callKreaImageAPI("a red apple", baseParams),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("rejects malformed queue status instead of polling until timeout", async () => {
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        status_url: STATUS_URL,
                        response_url: RESULT_URL,
                    }),
                    { status: 200 },
                ),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ status: "UNKNOWN" }), {
                    status: 200,
                }),
            );

        await expect(
            callKreaImageAPI("a red apple", baseParams),
        ).rejects.toMatchObject({
            status: 502,
            message: "Krea returned an invalid status",
        });
    });
});
