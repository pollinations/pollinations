import { expect, it } from "vitest";
import { streamSSE } from "./stream.js";

it("reads data lines without a space after the colon", async () => {
    const response = new Response(
        'data:{"choices":[{"delta":{"content":"Hello"}}]}\n\ndata:[DONE]\n\n',
    );
    const chunks: string[] = [];
    for await (const chunk of streamSSE(response)) chunks.push(chunk);
    expect(chunks).toEqual(["Hello"]);
});

it("rejects a stream that ends before [DONE]", async () => {
    const response = new Response(
        'data: {"choices":[{"delta":{"content":"An unfinished answer"}}]}\n\n',
    );
    const stream = streamSSE(response);
    expect(await stream.next()).toEqual({
        value: "An unfinished answer",
        done: false,
    });
    // Only [DONE] terminates an OpenAI-compatible stream successfully.
    await expect(stream.next()).rejects.toThrow(
        "Stream interrupted before [DONE]",
    );
});
