import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callXaiVideoAPI } from "../../src/image/models/xaiVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";
import type { ProgressManager } from "../../src/image/progressBar.ts";

const XAI_SUBMIT_URL = "https://api.x.ai/v1/videos/generations";
const XAI_POLL_URL = "https://api.x.ai/v1/videos/vid-xai-test";
const VIDEO_URL = "https://video.example.com/xai-output.mp4";

interface XaiRequest {
    url: string;
    body: Record<string, unknown>;
}

const asProgress = (progress: ReturnType<typeof makeProgress>) =>
    progress as unknown as ProgressManager;

function makeProgress() {
    return {
        updateBar: vi.fn(),
        finishBar: vi.fn(),
        removeBar: vi.fn(),
    };
}

// width/height carry params.ts' square default (1024) that fires when the
// caller omits dimensions; dimensionsExplicit=false flags that omission.
const baseParams: ImageParams = {
    model: "grok-video-pro",
    width: 1024,
    height: 1024,
    dimensionsExplicit: false,
    seed: 42,
    nofeed: false,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: true,
    duration: 5,
};

function mockXaiFetch(requests: XaiRequest[]) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();

            if (href === XAI_SUBMIT_URL) {
                const body = JSON.parse(init?.body as string) as Record<
                    string,
                    unknown
                >;
                requests.push({ url: href, body });
                return new Response(JSON.stringify({ id: "vid-xai-test" }), {
                    status: 200,
                });
            }

            if (href === XAI_POLL_URL) {
                return new Response(
                    JSON.stringify({
                        status: "done",
                        video: { url: VIDEO_URL, duration: 5 },
                    }),
                    { status: 200 },
                );
            }

            if (href === VIDEO_URL) {
                return new Response(new Uint8Array([0, 0, 0, 24]), {
                    status: 200,
                    headers: { "Content-Type": "video/mp4" },
                });
            }

            return new Response("unexpected URL", { status: 404 });
        });
}

async function submitAspectRatio(params: ImageParams): Promise<unknown> {
    syncImageEnv({ XAI_API_KEY: "xai-test-key" } as CloudflareBindings, [
        "XAI_API_KEY",
    ]);
    const requests: XaiRequest[] = [];
    mockXaiFetch(requests);

    await callXaiVideoAPI(
        "a calm ocean at sunrise",
        params,
        asProgress(makeProgress()),
        "req-xai-video",
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(XAI_SUBMIT_URL);
    return requests[0].body.aspect_ratio;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("xaiVideoModel aspect ratio handling", () => {
    it("honors explicit aspectRatio (16:9) when width/height are omitted", async () => {
        const aspectRatio = await submitAspectRatio({
            ...baseParams,
            dimensionsExplicit: false,
            aspectRatio: "16:9",
        });
        expect(aspectRatio).toBe("16:9");
    });

    it("honors explicit aspectRatio (9:16) when width/height are omitted", async () => {
        const aspectRatio = await submitAspectRatio({
            ...baseParams,
            dimensionsExplicit: false,
            aspectRatio: "9:16",
        });
        expect(aspectRatio).toBe("9:16");
    });

    it("derives aspect ratio from explicit width/height (1920x1080 → 16:9)", async () => {
        const aspectRatio = await submitAspectRatio({
            ...baseParams,
            width: 1920,
            height: 1080,
            dimensionsExplicit: true,
            // An aspectRatio param must NOT override explicit dimensions.
            aspectRatio: "9:16",
        });
        expect(aspectRatio).toBe("16:9");
    });

    it("falls back to square-default ratio when no dims and no aspectRatio", async () => {
        const aspectRatio = await submitAspectRatio({
            ...baseParams,
            dimensionsExplicit: false,
            aspectRatio: undefined,
        });
        expect(aspectRatio).toBe("1:1");
    });
});
