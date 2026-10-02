import { describe, expect, it } from "vitest";
import { streamSSE } from "./stream.js";

const encoder = new TextEncoder();

describe("streamSSE reader cleanup", () => {
    it("cancels and unlocks the response after [DONE]", async () => {
        let cancelled = false;
        const response = new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                },
                cancel() {
                    cancelled = true;
                },
            }),
        );

        expect((await streamSSE(response).next()).done).toBe(true);
        expect(response.body?.locked).toBe(false);
        expect(cancelled).toBe(true);
    });

    it("cancels and unlocks when the consumer stops early", async () => {
        let cancelled = false;
        const response = new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(
                            'data: {"choices":[{"delta":{"content":"x"}}]}\n\n',
                        ),
                    );
                },
                cancel() {
                    cancelled = true;
                },
            }),
        );
        const iterator = streamSSE(response);

        expect((await iterator.next()).value).toBe("x");
        await iterator.return();
        expect(response.body?.locked).toBe(false);
        expect(cancelled).toBe(true);
    });

    it("cancels and unlocks after a provider error", async () => {
        let cancelled = false;
        const response = new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(
                            'data: {"error":{"message":"provider failure"}}\n\n',
                        ),
                    );
                },
                cancel() {
                    cancelled = true;
                },
            }),
        );

        await expect(streamSSE(response).next()).rejects.toThrow(
            "provider failure",
        );
        expect(response.body?.locked).toBe(false);
        expect(cancelled).toBe(true);
    });

    it("unlocks after a stream read error", async () => {
        const readError = new Error("read failure");
        const response = new Response(
            new ReadableStream({
                start(controller) {
                    controller.error(readError);
                },
            }),
        );

        await expect(streamSSE(response).next()).rejects.toBe(readError);
        expect(response.body?.locked).toBe(false);
    });

    it("preserves text and event metadata when the stream ends normally", async () => {
        const response = new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(
                            'data: {"model":"test-model","usage":{"total_tokens":7},"choices":[{"delta":{"content":"hello"}}]}\n\n',
                        ),
                    );
                    controller.close();
                },
            }),
        );
        const events: { model?: string; usage?: { total_tokens?: number } }[] =
            [];
        let text = "";

        for await (const chunk of streamSSE(response, (event) =>
            events.push(event),
        )) {
            text += chunk;
        }

        expect(text).toBe("hello");
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            model: "test-model",
            usage: { total_tokens: 7 },
        });
        expect(response.body?.locked).toBe(false);
    });

    it("preserves a callback error if cancelling also rejects", async () => {
        const callbackError = new Error("callback failure");
        let cancellationAttempted = false;
        const response = new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode("data: {}\n\n"));
                },
                cancel() {
                    cancellationAttempted = true;
                    throw new Error("cancel failure");
                },
            }),
        );

        await expect(
            streamSSE(response, () => {
                throw callbackError;
            }).next(),
        ).rejects.toBe(callbackError);
        expect(cancellationAttempted).toBe(true);
        expect(response.body?.locked).toBe(false);
    });
});
