import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import {
    priceToEventParams,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callAlibabaImage,
    resolveQwenImage21TurboSize,
} from "../../src/image/models/alibabaImageModel.ts";
import { callAlibabaVideo } from "../../src/image/models/alibabaVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";
import { callAlibabaMedia } from "../../src/image/utils/alibabaClient.ts";

const params: ImageParams = {
    model: "alibaba/wan-3.0",
    width: 1024,
    height: 1024,
    dimensionsExplicit: false,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: true,
};
const outputUrl = "https://example.com/result";
beforeEach(() =>
    syncImageEnv({ DASHSCOPE_API_KEY: "test-key" } as CloudflareBindings, [
        "DASHSCOPE_API_KEY",
    ]),
);
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("Alibaba media adapters", () => {
    it("bills reference and generated video seconds separately", async () => {
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    output: {
                        task_id: "job",
                        task_status: "SUCCEEDED",
                        video_url: outputUrl,
                    },
                    usage: {
                        input_video_duration: 3,
                        output_video_duration: 5,
                    },
                }),
            )
            .mockResolvedValueOnce(
                new Response(new Uint8Array([1, 2, 3]), {
                    headers: { "content-type": "video/mp4" },
                }),
            );
        const result = await callAlibabaVideo(
            "Animate",
            { ...params, reference_videos: ["https://example.com/input.mp4"] },
            "3.0",
        );
        expect(
            JSON.parse(fetch.mock.calls[0][1]?.body as string),
        ).toMatchObject({
            model: "wan3.0-video-prime",
            input: {
                media: [
                    {
                        type: "reference_video",
                        url: "https://example.com/input.mp4",
                    },
                ],
            },
        });
        expect(result.trackingData?.usage).toEqual({
            promptVideoSeconds: 3,
            completionVideoSeconds: 5,
        });
        const definition = IMAGE_SERVICES["alibaba/wan-3.0"];
        const billed = calculateUsageBilling({
            model: params.model,
            usage: result.trackingData?.usage ?? {},
            servedBy: definition,
            quotedBy: definition,
        });
        expect(billed.price.totalPrice).toBeCloseTo(0.544);
        expect(usageToEventParams(result.trackingData?.usage)).toMatchObject({
            tokenCountPromptVideoSeconds: 3,
            tokenCountCompletionVideoSeconds: 5,
        });
        expect(priceToEventParams(definition.cost)).toMatchObject({
            tokenPricePromptVideoSeconds: 0.068,
        });
    });
    it("preserves Wan 2.6 portrait selection and duration rounding", async () => {
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    output: {
                        task_id: "job",
                        task_status: "SUCCEEDED",
                        video_url: outputUrl,
                    },
                    usage: {
                        input_video_duration: 0,
                        output_video_duration: 10,
                    },
                }),
            )
            .mockResolvedValueOnce(new Response("video"));
        await callAlibabaVideo(
            "Animate",
            {
                ...params,
                model: "alibaba/wan-2.6",
                aspectRatio: "9:16",
                duration: 8,
            },
            "2.6",
        );
        expect(
            JSON.parse(fetch.mock.calls[0][1]?.body as string),
        ).toMatchObject({
            model: "wan2.6-t2v",
            parameters: { size: "720*1280", duration: 10 },
        });
    });
    it("keeps polling one accepted job beyond five minutes", async () => {
        vi.useFakeTimers();
        let polls = 0;
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (_url, init) =>
                Response.json({
                    output:
                        init?.method === "POST"
                            ? { task_id: "job", task_status: "PENDING" }
                            : {
                                  task_status:
                                      ++polls > 151 ? "SUCCEEDED" : "RUNNING",
                              },
                }),
            );
        const pending = callAlibabaMedia("/test", {}, true);
        await vi.runAllTimersAsync();
        await pending;
        expect(
            fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
        ).toHaveLength(1);
        expect(polls).toBe(152);
    });
    it.each([
        ["InvalidParameter", 400],
        ["DataInspectionFailed", 422],
        ["InternalError", 502],
    ])("maps terminal %s errors", async (code, status) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                output: {
                    task_id: "job",
                    task_status: "FAILED",
                    code,
                    message: "Provider explanation",
                },
            }),
        );
        await expect(callAlibabaMedia("/test", {}, true)).rejects.toMatchObject(
            { status, message: "Provider explanation" },
        );
    });
    it("requires reported duration before returning a billable video", async () => {
        const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                output: {
                    task_id: "job",
                    task_status: "SUCCEEDED",
                    video_url: outputUrl,
                },
                usage: { duration: 5 },
            }),
        );
        await expect(
            callAlibabaVideo("Animate", params, "3.0"),
        ).rejects.toThrow("invalid output video duration");
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it.each(["wan2.7-image", "qwen-image-3.0-pro"] as const)(
        "maps %s edit inputs and provider image usage",
        async (model) => {
            const fetch = vi
                .spyOn(globalThis, "fetch")
                .mockResolvedValueOnce(
                    Response.json({
                        output: {
                            task_id: "job",
                            task_status: "SUCCEEDED",
                            choices: [
                                {
                                    message: {
                                        content: [{ image: outputUrl }],
                                    },
                                },
                            ],
                        },
                        usage: {
                            image_count: 1,
                            output_image_count: 1,
                            input_image_count: 1,
                        },
                    }),
                )
                .mockResolvedValueOnce(
                    new Response("image", {
                        headers: { "content-type": "image/png" },
                    }),
                );
            const result = await callAlibabaImage(
                "Edit",
                { ...params, image: ["data:image/png;base64,AQID"] },
                model,
            );
            const request = JSON.parse(fetch.mock.calls[0][1]?.body as string);
            expect(request.input.messages[0].content).toEqual([
                { image: "data:image/png;base64,AQID" },
                { text: "Edit" },
            ]);
            expect(result.trackingData?.usage).toEqual(
                model === "wan2.7-image"
                    ? { completionImageTokens: 1 }
                    : { completionImageTokens: 1, promptImageTokens: 1 },
            );
            expect(
                new Headers(fetch.mock.calls[0][1]?.headers).get(
                    "X-DashScope-Async",
                ),
            ).toBe(model === "wan2.7-image" ? null : "enable");
        },
    );
    it("sends Qwen Image 2.1 Turbo the requested size, seed and no watermark, billing each output image", async () => {
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    output: {
                        choices: [
                            { message: { content: [{ image: outputUrl }] } },
                        ],
                    },
                    usage: { image_count: 1, width: 1280, height: 720 },
                }),
            )
            .mockResolvedValueOnce(
                new Response("image", {
                    headers: { "content-type": "image/png" },
                }),
            );
        const turbo: ImageParams = {
            ...params,
            model: "qwen/qwen-image-2.1-turbo",
            width: 1280,
            height: 720,
        };
        const result = await callAlibabaImage(
            "A lighthouse at dusk",
            turbo,
            "qwen-image-2.1-turbo",
        );
        expect(fetch.mock.calls[0][0]).toBe(
            "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
        );
        expect(
            new Headers(fetch.mock.calls[0][1]?.headers).get(
                "X-DashScope-Async",
            ),
        ).toBeNull();
        expect(
            JSON.parse(fetch.mock.calls[0][1]?.body as string).parameters,
        ).toEqual({
            size: "1280*720",
            n: 1,
            seed: 42,
            watermark: false,
            prompt_extend: false,
        });
        expect(result.trackingData?.usage).toEqual({
            completionImageTokens: 1,
        });
        const definition = IMAGE_SERVICES["qwen/qwen-image-2.1-turbo"];
        const billed = calculateUsageBilling({
            model: turbo.model,
            usage: result.trackingData?.usage ?? {},
            servedBy: definition,
            quotedBy: definition,
        });
        expect(billed.price.totalPrice).toBeCloseTo(0.016);
    });

    it("sends Qwen Image 2.1 Turbo reference images and bills only the output image", async () => {
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    output: {
                        choices: [
                            { message: { content: [{ image: outputUrl }] } },
                        ],
                    },
                    usage: { image_count: 1 },
                }),
            )
            .mockResolvedValueOnce(
                new Response("image", {
                    headers: { "content-type": "image/png" },
                }),
            );
        const result = await callAlibabaImage(
            "Make it blue",
            {
                ...params,
                model: "qwen/qwen-image-2.1-turbo",
                image: [
                    "data:image/png;base64,AQID",
                    "data:image/png;base64,BAUG",
                ],
            },
            "qwen-image-2.1-turbo",
        );
        expect(
            JSON.parse(fetch.mock.calls[0][1]?.body as string).input.messages[0]
                .content,
        ).toEqual([
            { image: "data:image/png;base64,AQID" },
            { image: "data:image/png;base64,BAUG" },
            { text: "Make it blue" },
        ]);
        expect(result.trackingData?.usage).toEqual({
            completionImageTokens: 1,
        });
    });
});

describe("qwen-image-2.1-turbo size clamp", () => {
    const MIN_AREA = 512 * 512;
    const MAX_AREA = 2560 * 2560;

    const resolve = (width: number, height: number) => {
        const size = resolveQwenImage21TurboSize({
            ...params,
            width,
            height,
        });
        const area = size.width * size.height;
        expect(size.width % 16).toBe(0);
        expect(size.height % 16).toBe(0);
        expect(area).toBeGreaterThanOrEqual(MIN_AREA);
        expect(area).toBeLessThanOrEqual(MAX_AREA);
        return size;
    };

    it("passes valid aligned in-range sizes through unchanged", () => {
        expect(resolve(1280, 720)).toEqual({ width: 1280, height: 720 });
        expect(resolve(1024, 1024)).toEqual({ width: 1024, height: 1024 });
        expect(resolve(512, 512)).toEqual({ width: 512, height: 512 });
        expect(resolve(2560, 2560)).toEqual({ width: 2560, height: 2560 });
        // Non-square passthrough.
        expect(resolve(2048, 1024)).toEqual({ width: 2048, height: 1024 });
    });

    it("scales tiny requests up to the minimum area", () => {
        expect(resolve(100, 100)).toEqual({ width: 512, height: 512 });
        const size = resolve(320, 240);
        expect(size.width * size.height).toBeGreaterThanOrEqual(MIN_AREA);
    });

    it("scales huge requests down to the maximum area", () => {
        expect(resolve(4000, 4000)).toEqual({ width: 2560, height: 2560 });
        const size = resolve(5000, 3000);
        expect(size.width * size.height).toBeLessThanOrEqual(MAX_AREA);
    });

    it("re-clamps when 16px rounding crosses a limit", () => {
        // Naive rounding gives 2560*2576 (area 6,594,560 > max).
        const over = resolve(2552, 2568);
        expect(`${over.width}*${over.height}`).not.toBe("2560*2576");
        // Naive rounding gives 496*528 (area 261,888 < min).
        const under = resolve(503, 527);
        expect(`${under.width}*${under.height}`).not.toBe("496*528");
    });

    it("handles extreme aspect ratios within the area bounds", () => {
        resolve(10, 10000);
        // Proportional floor would zero the thin side here; the pinned side
        // must still leave the area within bounds.
        expect(resolve(1, 1000000)).toEqual({ width: 16, height: 409600 });
    });

    it("approximately preserves aspect ratio when resizing", () => {
        const size = resolve(6000, 2000);
        expect(size.width / size.height).toBeCloseTo(3, 1);
    });

    it.each([
        [0, 100],
        [100, 0],
        [-5, 200],
        [200, -20],
        [Number.NaN, 100],
        [100, Number.POSITIVE_INFINITY],
    ])("falls back to 1024x1024 for invalid %sx%s", (width, height) => {
        expect(
            resolveQwenImage21TurboSize({ ...params, width, height }),
        ).toEqual({ width: 1024, height: 1024 });
    });

    it("uses the clamped size on the 10-reference-image edit path", async () => {
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    output: {
                        choices: [
                            { message: { content: [{ image: outputUrl }] } },
                        ],
                    },
                    usage: { image_count: 1 },
                }),
            )
            .mockResolvedValueOnce(
                new Response("image", {
                    headers: { "content-type": "image/png" },
                }),
            );
        const images = Array.from(
            { length: 10 },
            () => "data:image/png;base64,AQID",
        );
        await callAlibabaImage(
            "Make it blue",
            {
                ...params,
                model: "qwen/qwen-image-2.1-turbo",
                // Raw passthrough would send "100*100" (provider 400).
                width: 100,
                height: 100,
                image: images,
            },
            "qwen-image-2.1-turbo",
        );
        const request = JSON.parse(fetch.mock.calls[0][1]?.body as string);
        expect(request.parameters.size).toBe("512*512");
        expect(request.input.messages[0].content).toHaveLength(11);
    });
});
