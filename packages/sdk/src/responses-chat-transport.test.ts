import { describe, expect, it } from "vitest";
import {
    responsesSseToUiMessageStream,
    uiMessagesToResponsesInput,
} from "./responses-chat-transport.ts";

describe("uiMessagesToResponsesInput", () => {
    it("maps text parts to Responses input_text items", () => {
        const input = uiMessagesToResponsesInput([
            {
                role: "user",
                parts: [{ type: "text", text: "hello" }],
            },
            {
                role: "assistant",
                content: "hi there",
            },
        ]);
        expect(input).toEqual([
            {
                role: "user",
                content: [{ type: "input_text", text: "hello" }],
            },
            {
                role: "assistant",
                content: [{ type: "input_text", text: "hi there" }],
            },
        ]);
    });
});

describe("responsesSseToUiMessageStream", () => {
    it("emits text-delta and finish chunks from Responses SSE", async () => {
        const sse = [
            'data: {"type":"response.output_text.delta","delta":"Hel"}',
            'data: {"type":"response.output_text.delta","delta":"lo"}',
            'data: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":2}}}',
            "",
        ].join("\n");
        const source = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(sse));
                controller.close();
            },
        });
        const out = responsesSseToUiMessageStream(source);
        const text = await new Response(out).text();
        expect(text).toContain('"type":"text-delta"');
        expect(text).toContain('"delta":"Hel"');
        expect(text).toContain('"delta":"lo"');
        expect(text).toContain('"type":"finish"');
        expect(text).toContain('"input_tokens":3');
    });
});
