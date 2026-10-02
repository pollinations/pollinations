import { describe, expect, it, vi } from "vitest";
import { streamSSE } from "./stream.js";

describe("streamSSE data field spacing", () => {
    it.each([
        "data:",
        "data: ",
    ])("reads content, metadata and DONE with %j", async (prefix) => {
        const frames = [
            JSON.stringify({
                model: "test-model",
                choices: [{ delta: { content: "Hello" } }],
            }),
            JSON.stringify({ usage: { total_tokens: 7 } }),
            "[DONE]",
            JSON.stringify({ choices: [{ delta: { content: "ignored" } }] }),
        ];
        const response = new Response(
            frames.map((frame) => `${prefix}${frame}\n\n`).join(""),
        );
        const onEvent = vi.fn();
        const chunks: string[] = [];
        for await (const chunk of streamSSE(response, onEvent)) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(["Hello"]);
        expect(onEvent).toHaveBeenCalledTimes(2);
        expect(onEvent).toHaveBeenNthCalledWith(2, {
            usage: { total_tokens: 7 },
        });
    });

    it.each(["data:", "data: "])("surfaces errors with %j", async (prefix) => {
        const response = new Response(
            `${prefix}${JSON.stringify({ error: { message: "provider failed" } })}\n\n`,
        );
        await expect(streamSSE(response).next()).rejects.toThrow(
            "provider failed",
        );
    });
});
