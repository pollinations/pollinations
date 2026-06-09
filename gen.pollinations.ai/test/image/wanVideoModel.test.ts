import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callWanAPI,
    callWanFastAPI,
    callWanProAPI,
} from "../../src/image/models/wanVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";
import type { ProgressManager } from "../../src/image/progressBar.ts";

const DASHSCOPE_SUBMIT_URL =
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis";
const DASHSCOPE_POLL_URL =
    "https://dashscope-intl.aliyuncs.com/api/v1/tasks/task-wan-test";
const VIDEO_URL = "https://video.example.com/wan-output.mp4";
const INPUT_IMAGE_URL = "https://img.example.com/first-frame.png";
// PNG magic bytes so downloadUserImage's detectMimeType resolves to image/png.
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const EXPECTED_DATA_URI = /^data:image\/png;base64,/;

interface DashScopeRequest {
    url: string;
    body: {
        model: string;
        input: Record<string, unknown>;
        parameters: Record<string, unknown>;
    };
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

const baseParams: ImageParams = {
    model: "wan-pro",
    width: 1280,
    height: 720,
    dimensionsExplicit: false,
    seed: 42,
    enhance: false,
    negative_prompt: "",
    nofeed: false,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: true,
    duration: 2,
};

function mockDashScopeFetch(requests: DashScopeRequest[], videoDuration = 2) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();

            if (href === DASHSCOPE_SUBMIT_URL) {
                const body = JSON.parse(
                    init?.body as string,
                ) as DashScopeRequest["body"];
                requests.push({ url: href, body });
                return new Response(
                    JSON.stringify({
                        output: { task_id: "task-wan-test" },
                    }),
                    { status: 200 },
                );
            }

            if (href === DASHSCOPE_POLL_URL) {
                return new Response(
                    JSON.stringify({
                        output: {
                            task_status: "SUCCEEDED",
                            video_url: VIDEO_URL,
                        },
                        usage: { video_duration: videoDuration },
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

            if (href === INPUT_IMAGE_URL) {
                return new Response(PNG_BYTES, {
                    status: 200,
                    headers: { "Content-Type": "image/png" },
                });
            }

            return new Response("unexpected URL", { status: 404 });
        });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("wanVideoModel billing usage", () => {
    it("bundles wan-pro audio usage into video seconds", async () => {
        syncImageEnv(
            { DASHSCOPE_API_KEY: "dashscope-test-key" } as CloudflareBindings,
            ["DASHSCOPE_API_KEY"],
        );
        const requests: DashScopeRequest[] = [];
        mockDashScopeFetch(requests, 2);

        const result = await callWanProAPI(
            "a calm ocean at sunrise",
            baseParams,
            asProgress(makeProgress()),
            "req-wan-pro",
        );

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe(DASHSCOPE_SUBMIT_URL);
        expect(requests[0].body.model).toBe("wan2.7-t2v");
        expect(requests[0].body.input).toEqual({
            prompt: "a calm ocean at sunrise",
        });
        expect(requests[0].body.parameters).toEqual({
            resolution: "720P",
            duration: 2,
            prompt_extend: true,
            audio: true,
        });
        expect(result.mimeType).toBe("video/mp4");
        expect(result.trackingData).toEqual({
            actualModel: "wan-pro",
            usage: {
                completionVideoSeconds: 2,
            },
        });
    });

    it("keeps separate audio usage for wan models with separate audio pricing", async () => {
        syncImageEnv(
            { DASHSCOPE_API_KEY: "dashscope-test-key" } as CloudflareBindings,
            ["DASHSCOPE_API_KEY"],
        );
        const requests: DashScopeRequest[] = [];
        mockDashScopeFetch(requests, 3);

        const result = await callWanAPI(
            "a calm ocean at sunrise",
            { ...baseParams, model: "wan", duration: 3 },
            asProgress(makeProgress()),
            "req-wan",
        );

        expect(requests[0].body.model).toBe("wan2.6-t2v");
        expect(requests[0].body.parameters.audio).toBe(true);
        expect(result.trackingData).toEqual({
            actualModel: "wan",
            usage: {
                completionVideoSeconds: 3,
                completionAudioSeconds: 3,
            },
        });
    });
});

describe("wanVideoModel image-to-video input schema", () => {
    it("wan-pro (wan2.7) i2v sends the image as input.media[].first_frame", async () => {
        syncImageEnv(
            { DASHSCOPE_API_KEY: "dashscope-test-key" } as CloudflareBindings,
            ["DASHSCOPE_API_KEY"],
        );
        const requests: DashScopeRequest[] = [];
        mockDashScopeFetch(requests);

        await callWanProAPI(
            "a cat walking",
            { ...baseParams, image: [INPUT_IMAGE_URL] },
            asProgress(makeProgress()),
            "req-wan-pro-i2v",
        );

        expect(requests).toHaveLength(1);
        expect(requests[0].body.model).toBe("wan2.7-i2v");
        const input = requests[0].body.input;
        // wan2.7 uses the unified media array, NOT the legacy img_url string.
        expect(input.img_url).toBeUndefined();
        const media = input.media as Array<{ type: string; url: string }>;
        expect(media).toHaveLength(1);
        expect(media[0].type).toBe("first_frame");
        expect(media[0].url).toMatch(EXPECTED_DATA_URI);
    });

    it("wan-fast (wan2.2) i2v still uses the legacy img_url string", async () => {
        syncImageEnv(
            { DASHSCOPE_API_KEY: "dashscope-test-key" } as CloudflareBindings,
            ["DASHSCOPE_API_KEY"],
        );
        const requests: DashScopeRequest[] = [];
        mockDashScopeFetch(requests);

        await callWanFastAPI(
            "a cat walking",
            { ...baseParams, model: "wan-fast", image: [INPUT_IMAGE_URL] },
            asProgress(makeProgress()),
            "req-wan-fast-i2v",
        );

        expect(requests[0].body.model).toBe("wan2.2-i2v-flash");
        const input = requests[0].body.input;
        expect(input.media).toBeUndefined();
        expect(input.img_url as string).toMatch(EXPECTED_DATA_URI);
    });
});
