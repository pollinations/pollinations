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

    it("removes framing split across streaming chunks", async () => {
        const result = await streamText({ stream: true }, [
            'data: {"choices":[{"delta":{"content":"<|STA',
            'RT_TEXT|>Hello"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":" world<|END_',
            'TEXT|>"}}]}\n\n',
            "data: [DONE]\n\n",
        ]);

        expect(result).toBe(
            'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
                'data: {"choices":[{"delta":{"content":" world"}}]}\n\n' +
                "data: [DONE]\n\n",
        );
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
                    'Cohere Command A+ on Azure supports tool_choice "auto" only',
            }),
        );
    });
});
