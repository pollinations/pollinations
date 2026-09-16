import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import {
    callRodinFalAPI,
    RODIN_IMAGE_ENDPOINT,
    RODIN_TEXT_ENDPOINT,
} from "../../src/model3d/models/rodinModel.ts";
import type { Model3dParams } from "../../src/model3d/params.ts";

const CLEAN_JPEG_DATA_URI =
    "data:image/jpeg;base64,/9j/wAALCAABAAEDAREA/9oAAwD/2Q==";
const CLEAN_JPEG_BYTES = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03,
    0x01, 0x11, 0x00, 0xff, 0xda, 0x00, 0x03, 0x00, 0xff, 0xd9,
]);

beforeEach(() => {
    syncModel3dEnvironment({
        ...env,
        FAL_KEY: "fal_test_key",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function params(overrides: Partial<Model3dParams> = {}): Model3dParams {
    return {
        model: "hyper3d-rodin",
        resolution: "low",
        image: [],
        safe: false,
        ...overrides,
    };
}

function mockFalQueue(meshContentType = "application/octet-stream") {
    let callIndex = 0;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const href = typeof url === "string" ? url : url.toString();
        if (href === "https://example.com/ref.jpg") {
            return new Response(CLEAN_JPEG_BYTES, {
                headers: { "content-type": "image/jpeg" },
            });
        }
        if (callIndex === 0) {
            callIndex++;
            return Response.json(
                {
                    request_id: "req_1",
                    status_url: "https://queue.fal.run/status",
                    response_url: "https://queue.fal.run/result",
                },
                { status: 202 },
            );
        }
        if (callIndex === 1) {
            callIndex++;
            return Response.json({ status: "COMPLETED" }, { status: 200 });
        }
        if (callIndex === 2) {
            callIndex++;
            return Response.json({
                model_mesh: {
                    url: "https://v3.fal.media/files/rodin/model.glb",
                    content_type: meshContentType,
                },
            });
        }
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
}

// callRodinFalAPI's poll loop sleeps 5s before its first status check, so
// every successful-path test needs fake timers advanced past that (mirrors
// falClient.test.ts's runFalJob test).
async function callWithFakeTimers(
    prompt: string,
    p: Model3dParams,
): ReturnType<typeof callRodinFalAPI> {
    vi.useFakeTimers();
    const promise = callRodinFalAPI(prompt, p);
    await vi.advanceTimersByTimeAsync(10_000);
    return promise;
}

describe("callRodinFalAPI", () => {
    it("routes image input to the image-to-3D endpoint", async () => {
        const fetchSpy = mockFalQueue();

        await callWithFakeTimers(
            "",
            params({ image: ["https://example.com/ref.jpg"] }),
        );

        const submitCall = fetchSpy.mock.calls.find(([url]) =>
            String(url).includes(RODIN_IMAGE_ENDPOINT),
        );
        expect(submitCall).toBeDefined();
        const body = JSON.parse(
            (submitCall as [string, RequestInit])[1].body as string,
        );
        expect(body.image_urls).toEqual([CLEAN_JPEG_DATA_URI]);
    });

    it("routes text-only input to the dedicated text-to-3D endpoint", async () => {
        const fetchSpy = mockFalQueue();

        await callWithFakeTimers("a low-poly fox", params());

        const [submitUrl, submitInit] = fetchSpy.mock.calls[0] as [
            string,
            RequestInit,
        ];
        expect(submitUrl).toBe(`https://queue.fal.run/${RODIN_TEXT_ENDPOINT}`);
        const body = JSON.parse(submitInit.body as string);
        expect(body.prompt).toBe("a low-poly fox");
        expect(body.image_urls).toBeUndefined();
    });

    it("throws when neither image nor prompt is provided", async () => {
        await expect(callRodinFalAPI("", params())).rejects.toBeTruthy();
    });

    it("always returns model/gltf-binary regardless of fal's reported content_type", async () => {
        mockFalQueue("application/octet-stream");

        const result = await callWithFakeTimers(
            "",
            params({ image: [CLEAN_JPEG_DATA_URI] }),
        );

        expect(result.contentType).toBe("model/gltf-binary");
    });

    it("passes seed through on the image-to-3D endpoint", async () => {
        const fetchSpy = mockFalQueue();

        await callWithFakeTimers(
            "",
            params({ image: [CLEAN_JPEG_DATA_URI], seed: 42 }),
        );

        const submitCall = fetchSpy.mock.calls.find(([url]) =>
            String(url).includes(RODIN_IMAGE_ENDPOINT),
        );
        expect(submitCall).toBeDefined();
        const body = JSON.parse(
            (submitCall as [string, RequestInit])[1].body as string,
        );
        expect(body.seed).toBe(42);
    });

    it("passes seed through on the text-to-3D endpoint", async () => {
        const fetchSpy = mockFalQueue();

        await callWithFakeTimers("a low-poly fox", params({ seed: 42 }));

        const body = JSON.parse(
            (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
        );
        expect(body.seed).toBe(42);
    });
});
