import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageParams } from "../../src/image/params.ts";

const bedrockMocks = vi.hoisted(() => ({
    send: vi.fn(),
}));

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
    BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
        send: bedrockMocks.send,
    })),
    InvokeModelCommand: vi.fn().mockImplementation((input) => input),
}));

vi.mock("@smithy/fetch-http-handler", () => ({
    FetchHttpHandler: vi.fn(),
}));

import { syncImageEnv } from "../../src/image/env.ts";
import { callNovaCanvasAPI } from "../../src/image/models/novaCanvasModel.ts";

describe("callNovaCanvasAPI", () => {
    beforeEach(() => {
        syncImageEnv(
            {
                AWS_ACCESS_KEY_ID: "test-access-key",
                AWS_SECRET_ACCESS_KEY: "test-secret-key",
                AWS_REGION: "us-east-1",
            } as CloudflareBindings,
            ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
        );
        bedrockMocks.send.mockReset();
    });

    it("wraps Bedrock validation exceptions as client errors", async () => {
        const validationError = Object.assign(
            new Error(
                "Malformed input request: #/textToImageParams/text: expected maxLength: 1024, actual: 1469.",
            ),
            {
                name: "ValidationException",
                $metadata: { httpStatusCode: 400 },
            },
        );
        bedrockMocks.send.mockRejectedValueOnce(validationError);

        await expect(
            callNovaCanvasAPI(
                "too long",
                {
                    model: "nova-canvas",
                    width: 1024,
                    height: 1024,
                    seed: 42,
                } as ImageParams,
                { updateBar: vi.fn() } as never,
                "request-id",
            ),
        ).rejects.toMatchObject({
            name: "HttpError",
            status: 400,
            message: expect.stringContaining("expected maxLength: 1024"),
            details: {
                validation: true,
                body: expect.stringContaining("expected maxLength: 1024"),
            },
        });
    });
});
