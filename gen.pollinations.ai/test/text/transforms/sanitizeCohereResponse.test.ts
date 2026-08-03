import { describe, expect, it } from "vitest";
import {
    sanitizeCohereResponse,
    validateCohereRequest,
} from "../../../src/text/cohereCommandAPlus.js";
import type { ChatCompletion } from "../../../src/text/types.js";

async function streamText(
    completion: ChatCompletion,
    chunks: string[],
): Promise<string> {
    const encoder = new TextEncoder();
    completion.responseStream = new ReadableStream({
        start(controller) {
            for (const chunk of chunks)
                controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });

    const sanitized = sanitizeCohereResponse(completion);
    return new Response(sanitized.responseStream).text();
}

describe("sanitizeCohereResponse", () => {
    it("removes Cohere framing from text while preserving reasoning", () => {
        const completion: ChatCompletion = {
            choices: [
                {
                    message: {
                        role: "assistant",
                        reasoning_content: "Checked the answer.",
                        content:
                            "<|END_THINKING|><|START_TEXT|>Hello<|END_TEXT|>",
                    },
                },
            ],
        };

        sanitizeCohereResponse(completion);

        expect(completion.choices?.[0].message).toEqual({
            role: "assistant",
            reasoning_content: "Checked the answer.",
            content: "Hello",
        });
    });

    it("removes every documented response framing token at boundaries", () => {
        const completion: ChatCompletion = {
            choices: [
                {
                    message: {
                        role: "assistant",
                        content:
                            "<|START_THINKING|><|END_THINKING|>" +
                            "<|START_RESPONSE|>Hello<|END_RESPONSE|>",
                    },
                },
            ],
        };

        sanitizeCohereResponse(completion);

        expect(completion.choices?.[0].message?.content).toBe("Hello");
    });

    it("preserves literal control tokens inside legitimate content", () => {
        const completion: ChatCompletion = {
            choices: [
                {
                    message: {
                        role: "assistant",
                        content:
                            "<|START_TEXT|>Print <|END_TEXT|> literally." +
                            "<|END_TEXT|>",
                    },
                },
            ],
        };

        sanitizeCohereResponse(completion);

        expect(completion.choices?.[0].message?.content).toBe(
            "Print <|END_TEXT|> literally.",
        );
    });

    it("removes framing split across network chunks and SSE events", async () => {
        const result = await streamText({ stream: true }, [
            'data: {"id":"one","choices":[{"index":0,"delta":{"content":"<|STA',
            'RT_"},"finish_reason":null}]}\n\n',
            'data: {"id":"one","choices":[{"index":0,"delta":{"content":"TEXT|>Hello"}}]}\n\n',
            'data: {"id":"one","choices":[{"index":0,"delta":{"content":" world<|END_',
            'TEXT|>"}}]}\n\n',
            'data: {"id":"one","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
            "data: [DONE]\n\n",
        ]);

        expect(result).toBe(
            'data: {"id":"one","choices":[{"index":0,"delta":{"content":""},"finish_reason":null}]}\n\n' +
                'data: {"id":"one","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n' +
                'data: {"id":"one","choices":[{"index":0,"delta":{"content":" world"}}]}\n\n' +
                'data: {"id":"one","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
                "data: [DONE]\n\n",
        );
    });

    it("scrubs only content deltas, not reasoning or tool arguments", async () => {
        const result = await streamText({ stream: true }, [
            'data: {"choices":[{"index":0,"delta":{"reasoning_content":"<|START_THINKING|>reason","tool_calls":[{"function":{"arguments":"{\\"value\\":\\"<|END_TEXT|>\\"}"}}],"content":"<|START_TEXT|>answer<|END_TEXT|>"},"finish_reason":"stop"}]}\n\n',
            "data: [DONE]\n\n",
        ]);

        const firstEvent = result.split("\n\n")[0].slice("data: ".length);
        const firstChunk = JSON.parse(firstEvent);
        expect(firstChunk.choices[0].delta).toEqual({
            reasoning_content: "<|START_THINKING|>reason",
            tool_calls: [
                {
                    function: {
                        arguments: '{"value":"<|END_TEXT|>"}',
                    },
                },
            ],
            content: "answer",
        });
    });
});

describe("validateCohereRequest", () => {
    it("accepts text and automatic tool selection", () => {
        expect(
            validateCohereRequest([{ role: "user", content: "hi" }], {
                tool_choice: "auto",
            }),
        ).toEqual({
            messages: [{ role: "user", content: "hi" }],
            options: { tool_choice: "auto" },
        });
    });

    it("honors tool_choice none by removing tools before Azure", () => {
        expect(
            validateCohereRequest([{ role: "user", content: "hi" }], {
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "lookup",
                            parameters: { type: "object", properties: {} },
                        },
                    },
                ],
                tool_choice: "none",
            }),
        ).toEqual({
            messages: [{ role: "user", content: "hi" }],
            options: {},
        });
    });

    it("rejects unsupported image input before calling Azure", () => {
        expect(() =>
            validateCohereRequest(
                [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "describe" },
                            {
                                type: "image_url",
                                image_url: { url: "https://example.com/a.jpg" },
                            },
                        ],
                    },
                ],
                {},
            ),
        ).toThrow(
            expect.objectContaining({
                status: 400,
                message: "Cohere Command A+ on Azure supports text input only",
            }),
        );
    });

    it("rejects tool choices the Azure route does not honor", () => {
        expect(() =>
            validateCohereRequest([{ role: "user", content: "hi" }], {
                tool_choice: "required",
            }),
        ).toThrow(
            expect.objectContaining({
                status: 400,
                message:
                    'Cohere Command A+ on Azure supports tool_choice "auto" or "none" only',
            }),
        );
    });
});
