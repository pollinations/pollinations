import { expect, it } from "vitest";
import { sseEvents, streamSSE } from "./stream.js";

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

it("yields refusal deltas as text", async () => {
    const response = new Response(
        'data: {"choices":[{"delta":{"refusal":"I cannot help with that."}}]}\n\ndata: [DONE]\n\n',
    );
    const chunks: string[] = [];
    for await (const chunk of streamSSE(response)) chunks.push(chunk);
    expect(chunks).toEqual(["I cannot help with that."]);
});

it("completes when [DONE] is the last line and has no trailing newline", async () => {
    const response = new Response(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]',
    );
    const chunks: string[] = [];
    for await (const chunk of streamSSE(response)) chunks.push(chunk);
    expect(chunks).toEqual(["Hello"]);
});

it("yields the last event but still rejects when [DONE] never arrives", async () => {
    const stream = streamSSE(
        new Response('data: {"choices":[{"delta":{"content":"Hi"}}]}'),
    );
    expect(await stream.next()).toEqual({ value: "Hi", done: false });
    await expect(stream.next()).rejects.toThrow(
        "Stream interrupted before [DONE]",
    );
});

it("preserves falsy JSON payloads", async () => {
    const events = sseEvents(
        new Response("data: null\ndata: false\ndata: 0\ndata: [DONE]"),
    );
    const received = [];
    for await (const event of events) received.push(event);
    expect(received).toEqual([null, false, 0]);
});

it("handles UTF-8 and CRLF split across chunks, including an unterminated DONE", async () => {
    const bytes = new TextEncoder().encode(
        'data: {"text":"é"}\r\ndata: [DONE]',
    );
    const body = new ReadableStream({
        start(controller) {
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
            controller.close();
        },
    });
    const received = [];
    for await (const event of sseEvents(new Response(body)))
        received.push(event);
    expect(received).toEqual([{ text: "é" }]);
});

it("flushes an incomplete UTF-8 sequence before reporting interruption", async () => {
    const bytes = new Uint8Array([
        ...new TextEncoder().encode('data: {"text":"'),
        0xc3,
    ]);
    const stream = sseEvents(new Response(bytes));
    await expect(stream.next()).rejects.toThrow(
        "Stream interrupted before [DONE]",
    );
});
