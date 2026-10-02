import type { ChatStreamChunk, Pollinations } from "@pollinations/sdk";
import { describe, expect, it } from "vitest";
import {
    messagesForPollinations,
    type PollinationsUIMessage,
    pollinationsChatTransport,
} from "./pollinations-chat-transport";

async function chunksFrom(events: ChatStreamChunk[]) {
    const client = {
        async *chatStream() {
            yield* events;
        },
    } as unknown as Pick<Pollinations, "chatStream">;
    const transport = pollinationsChatTransport({
        client,
        model: "floret",
    });
    const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat-1",
        messageId: undefined,
        messages: [
            {
                id: "user-1",
                role: "user",
                parts: [{ type: "text", text: "Find it" }],
            },
        ],
        abortSignal: undefined,
    });
    const chunks = [];
    const reader = stream.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    return chunks;
}

const TOOL_MARKUP =
    '<details type="tool_calls" done="true" id="call-1" name="SEARCH_WEB" ' +
    'arguments="{&quot;query&quot;:&quot;flowers&quot;}">\n' +
    "<summary>Tool Executed</summary>\n{&quot;count&quot;:1}\n</details>";

function contentChunk(content: string, id: string): ChatStreamChunk {
    return {
        id,
        object: "chat.completion.chunk",
        created: 1,
        model: "floret",
        choices: [
            {
                index: 0,
                delta: { content },
                finish_reason: null,
            },
        ],
    };
}

describe("messagesForPollinations", () => {
    it("preserves attachments and returns agent replies verbatim", () => {
        const messages: PollinationsUIMessage[] = [
            {
                id: "welcome",
                role: "assistant",
                metadata: { localOnly: true },
                parts: [{ type: "text", text: "Welcome" }],
            },
            {
                id: "user-1",
                role: "user",
                metadata: {
                    attachments: [
                        {
                            id: "upload-1",
                            name: "photo.png",
                            kind: "image",
                            url: "https://example.test/photo.png",
                            contentPart: {
                                type: "image_url",
                                image_url: {
                                    url: "https://example.test/photo.png",
                                },
                            },
                        },
                    ],
                },
                parts: [{ type: "text", text: "Describe this" }],
            },
            {
                id: "assistant-1",
                role: "assistant",
                parts: [{ type: "text", text: `Done.\n\n${TOOL_MARKUP}` }],
            },
        ];

        const result = messagesForPollinations(messages);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            role: "user",
            content: [
                { type: "text", text: "Describe this" },
                {
                    type: "image_url",
                    image_url: { url: "https://example.test/photo.png" },
                },
            ],
        });
        expect(result[1]).toEqual({
            role: "assistant",
            content: `Done.\n\n${TOOL_MARKUP}`,
        });
    });
});

describe("pollinationsChatTransport", () => {
    it("passes only model and signal to chatStream", async () => {
        let sentOptions: Parameters<Pollinations["chatStream"]>[1];
        const client: Pick<Pollinations, "chatStream"> = {
            async *chatStream(_messages, options) {
                sentOptions = options;
                yield contentChunk("Ready", "automatic-routing");
            },
        };
        const options = {
            client,
            model: "community/pollinations-ai/floret",
        };
        const transport = pollinationsChatTransport(options);
        const stream = await transport.sendMessages({
            trigger: "submit-message",
            chatId: "automatic-routing",
            messageId: undefined,
            messages: [],
            abortSignal: undefined,
        });
        const reader = stream.getReader();
        while (!(await reader.read()).done) {}
        expect(sentOptions).toEqual({
            model: "community/pollinations-ai/floret",
            signal: undefined,
        });
    });

    it("streams the reply as one verbatim text part, tool markup included", async () => {
        const source = `Found it.\n\n${TOOL_MARKUP}\n\n![Result](https://example.test/result.png)`;
        const chunks = await chunksFrom([
            contentChunk(source.slice(0, 15), "chunk-1"),
            contentChunk(source.slice(15), "chunk-2"),
        ]);

        expect(chunks.map((chunk) => chunk.type)).toEqual([
            "start",
            "start-step",
            "text-start",
            "text-delta",
            "text-delta",
            "text-end",
            "finish-step",
            "finish",
        ]);
        expect(
            chunks
                .filter((chunk) => chunk.type === "text-delta")
                .map((chunk) => chunk.delta)
                .join(""),
        ).toBe(source);
    });

    it("marks an aborted response stopped while preserving received text", async () => {
        const controller = new AbortController();
        const client = {
            async *chatStream(
                _messages: unknown,
                options: { signal: AbortSignal },
            ) {
                yield contentChunk("Partial answer", "partial");
                await new Promise<void>((_resolve, reject) => {
                    if (options.signal.aborted) reject(options.signal.reason);
                    else
                        options.signal.addEventListener(
                            "abort",
                            () => reject(options.signal.reason),
                            { once: true },
                        );
                });
            },
        } as unknown as Pick<Pollinations, "chatStream">;
        const stream = await pollinationsChatTransport({
            client,
            model: "floret",
        }).sendMessages({
            messages: [],
            abortSignal: controller.signal,
            trigger: "submit-message",
            chatId: "cancel-test",
            messageId: undefined,
        });
        const chunks = [];
        const reader = stream.getReader();
        while (true) {
            const { done, value: chunk } = await reader.read();
            if (done) break;
            chunks.push(chunk);
            if (chunk.type === "text-delta") controller.abort();
        }
        expect(
            chunks.find((chunk) => chunk.type === "text-delta"),
        ).toMatchObject({ delta: "Partial answer" });
        expect(
            chunks.find((chunk) => chunk.type === "data-responseStatus"),
        ).toMatchObject({ data: { status: "cancelled" } });
        expect(chunks.find((chunk) => chunk.type === "abort")).toMatchObject({
            reason: "cancelled",
        });
    });
});
