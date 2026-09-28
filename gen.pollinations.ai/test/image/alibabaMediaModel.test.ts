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
    it.each([
        "wan2.7-image",
        "qwen-image-3.0-pro",
    ] as const)("maps %s edit inputs and provider image usage", async (model) => {
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    output: {
                        task_id: "job",
                        task_status: "SUCCEEDED",
                        choices: [
                            { message: { content: [{ image: outputUrl }] } },
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
    });
});
