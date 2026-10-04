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
