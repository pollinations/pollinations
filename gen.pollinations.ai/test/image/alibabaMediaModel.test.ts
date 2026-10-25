import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import {
    priceToEventParams,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callAlibabaImage } from "../../src/image/models/alibabaImageModel.ts";
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

    it("sends Qwen Image 2.1 Pro to the Turbo route and bills the Singapore list price per output image", async () => {
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
        const result = await callAlibabaImage(
            "A lighthouse at dusk",
            {
                ...params,
                model: "qwen/qwen-image-2.1-pro",
                width: 1280,
                height: 720,
            },
            "qwen-image-2.1-pro",
        );
        expect(fetch.mock.calls[0][0]).toBe(
            "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
        );
        expect(
            JSON.parse(fetch.mock.calls[0][1]?.body as string).parameters.size,
        ).toBe("1280*720");
        const definition = IMAGE_SERVICES["qwen/qwen-image-2.1-pro"];
        const billed = calculateUsageBilling({
            model: "qwen/qwen-image-2.1-pro",
            usage: result.trackingData?.usage ?? {},
            servedBy: definition,
            quotedBy: definition,
        });
        expect(billed.price.totalPrice).toBeCloseTo(0.04);
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
