import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callWanAPI,
    callWanProAPI,
} from "../../src/image/models/wanVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";
import type { ProgressManager } from "../../src/image/progressBar.ts";

const DASHSCOPE_SUBMIT_URL =
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis";
const DASHSCOPE_POLL_URL =
    "https://dashscope-intl.aliyuncs.com/api/v1/tasks/task-wan-test";
const VIDEO_URL = "https://video.example.com/wan-output.mp4";

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
