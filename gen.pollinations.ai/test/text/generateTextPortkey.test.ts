import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTextPortkey } from "../../src/text/generateTextPortkey.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("generateTextPortkey", () => {
    it("passes image content through for text-only models", async () => {
        let upstreamBody: Record<string, unknown> | undefined;

        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (_input, init) => {
                upstreamBody = JSON.parse(String(init?.body));
                return Response.json({
                    id: "chatcmpl_test",
                    object: "chat.completion",
                    model: "provider-model",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                });
            },
        );

        await generateTextPortkey(
            [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What is in this image?" },
                        {
                            type: "image_url",
                            image_url: {
                                url: "https://example.com/image.png",
                            },
                        },
                    ],
                },
            ],
            {
                model: "deepseek",
                portkeyGatewayUrl: "https://portkey.test",
            },
        );

        expect(upstreamBody).toMatchObject({
            model: "accounts/fireworks/models/deepseek-v4-flash",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What is in this image?" },
                        {
                            type: "image_url",
                            image_url: {
                                url: "https://example.com/image.png",
                            },
                        },
                    ],
                },
            ],
        });
    });
});
