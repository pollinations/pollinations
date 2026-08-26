import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageParams } from "../../src/image/params.ts";

const awsMocks = vi.hoisted(() => ({
    bedrockSend: vi.fn(),
    s3Send: vi.fn(),
    startCommand: vi.fn(),
    getCommand: vi.fn(),
    getObjectCommand: vi.fn(),
}));

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
    BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
        send: awsMocks.bedrockSend,
    })),
    StartAsyncInvokeCommand: awsMocks.startCommand.mockImplementation(
        (input) => ({ kind: "start", input }),
    ),
    GetAsyncInvokeCommand: awsMocks.getCommand.mockImplementation((input) => ({
        kind: "get",
        input,
    })),
}));

vi.mock("@aws-sdk/client-s3", () => ({
    S3Client: vi.fn().mockImplementation(() => ({
        send: awsMocks.s3Send,
    })),
    GetObjectCommand: awsMocks.getObjectCommand.mockImplementation((input) => ({
        kind: "get-object",
        input,
    })),
}));

vi.mock("@smithy/fetch-http-handler", () => ({
    FetchHttpHandler: vi.fn(),
}));

import { syncImageEnv } from "../../src/image/env.ts";
import { callNovaReelAPI } from "../../src/image/models/novaReelModel.ts";

const FRAME_URL = "https://image.example.com/start.png";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

beforeEach(() => {
    syncImageEnv(
        {
            AWS_ACCESS_KEY_ID: "test-access-key",
            AWS_SECRET_ACCESS_KEY: "test-secret-key",
            AWS_REGION: "us-east-1",
            NOVA_REEL_S3_BUCKET: "test-bucket",
        } as CloudflareBindings,
        [
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_REGION",
            "NOVA_REEL_S3_BUCKET",
        ],
    );
    for (const mock of Object.values(awsMocks)) mock.mockReset();
    awsMocks.startCommand.mockImplementation((input) => ({
        kind: "start",
        input,
    }));
    awsMocks.getCommand.mockImplementation((input) => ({ kind: "get", input }));
    awsMocks.getObjectCommand.mockImplementation((input) => ({
        kind: "get-object",
        input,
    }));
    awsMocks.bedrockSend
        .mockResolvedValueOnce({ invocationArn: "arn:test:nova-reel" })
        .mockResolvedValueOnce({
            status: "Completed",
            outputDataConfig: {
                s3OutputDataConfig: {
                    s3Uri: "s3://test-bucket/nova-reel/test-request",
                },
            },
        });
    awsMocks.s3Send.mockResolvedValue({
        Body: {
            async *[Symbol.asyncIterator]() {
                yield new Uint8Array([0, 0, 0, 24]);
            },
        },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const href = typeof url === "string" ? url : url.toString();
        if (href === FRAME_URL) {
            return new Response(PNG_BYTES, {
                headers: { "Content-Type": "image/png" },
            });
        }
        return new Response("unexpected URL", { status: 404 });
    });
});

describe("Nova Reel frame mapping", () => {
    it("maps the first image to the Bedrock TEXT_VIDEO request", async () => {
        await callNovaReelAPI(
            "animate this frame",
            {
                model: "nova-reel",
                width: 1280,
                height: 720,
                dimensionsExplicit: true,
                seed: 42,
                safe: false,
                quality: "medium",
                image: [FRAME_URL],
                transparent: false,
                reasoning: "balanced",
                audio: false,
                duration: 6,
                referenceImages: [],
                referenceVideos: [],
                referenceAudios: [],
            } satisfies ImageParams,
            "test-request",
        );

        expect(awsMocks.startCommand).toHaveBeenCalledOnce();
        expect(awsMocks.startCommand.mock.calls[0][0]).toMatchObject({
            modelId: "amazon.nova-reel-v1:1",
            modelInput: {
                taskType: "TEXT_VIDEO",
                textToVideoParams: {
                    text: "animate this frame",
                    images: [
                        {
                            format: "png",
                            source: {
                                bytes: Buffer.from(PNG_BYTES).toString(
                                    "base64",
                                ),
                            },
                        },
                    ],
                },
            },
        });
    });
});
