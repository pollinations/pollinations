import type { ChatStreamEvent, Pollinations } from "@pollinations/sdk";
import { describe, expect, it } from "vitest";
import {
    messagesForPollinations,
    PollinationsChatTransport,
    type PollinationsUIMessage,
} from "./pollinations-chat-transport";

async function chunksFrom(events: ChatStreamEvent[]) {
    const client = {
        async *chatEventStream() {
            yield* events;
        },
    } as unknown as Pick<Pollinations, "chatEventStream">;
    const transport = new PollinationsChatTransport({
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

describe("messagesForPollinations", () => {
    it("preserves attachments and server-executed tool history", () => {
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
                            mimeType: "image/png",
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
                parts: [
                    { type: "text", text: "Done." },
                    {
                        type: "dynamic-tool",
                        toolName: "SEARCH_WEB",
                        toolCallId: "call-1",
                        state: "output-available",
                        input: { query: "flowers" },
                        output: { count: 1 },
                        providerExecuted: true,
                    },
                    {
                        type: "data-media",
                        id: "media-1",
                        data: {
                            kind: "image",
                            url: "https://example.test/result.png",
                            label: "Result",
                        },
                    },
                ],
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
        expect(result[1].content).toContain(
            '<details type="tool_calls" done="true"',
        );
        expect(result[1].content).toContain(
            "![Result](<https://example.test/result.png>)",
        );
    });
});

describe("PollinationsChatTransport", () => {
    it("normalizes agent tools and media into UI Message Stream chunks", async () => {
        const content =
            "Found it.\n\n" +
            '<details type="tool_calls" done="true" id="call-1" ' +
            'name="SEARCH_WEB" arguments="{&quot;query&quot;:&quot;flowers&quot;}">\n' +
            "<summary>Tool Executed</summary>\n" +
            "{&quot;count&quot;:1}\n</details>\n\n" +
            "![Result](<https://example.test/result.png>)";
        const chunks = await chunksFrom([
            {
                type: "agent",
                event: {
                    type: "tool.started",
                    call_id: "call-1",
                    name: "SEARCH_WEB",
                },
            },
            {
                type: "chunk",
                chunk: {
                    id: "chunk-1",
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
                },
            },
            {
                type: "agent",
                event: {
                    type: "resource.finalized",
                    call_id: "call-1",
                    kind: "image",
                    url: "https://example.test/result.png",
                    name: "Result",
                },
            },
            {
                type: "chunk",
                chunk: {
                    id: "chunk-2",
                    object: "chat.completion.chunk",
                    created: 1,
                    model: "floret",
                    choices: [
                        {
                            index: 0,
                            delta: {},
                            finish_reason: "stop",
                        },
                    ],
                },
            },
        ]);

        expect(chunks.map((chunk) => chunk.type)).toEqual([
            "start",
            "start-step",
            "data-activity",
            "text-start",
            "text-delta",
            "text-end",
            "tool-input-available",
            "tool-output-available",
            "data-media",
            "finish-step",
            "finish",
        ]);
        expect(
            chunks.find((chunk) => chunk.type === "tool-input-available"),
        ).toMatchObject({
            toolCallId: "call-1",
            toolName: "SEARCH_WEB",
            input: { query: "flowers" },
            providerExecuted: true,
            dynamic: true,
        });
        expect(
            chunks.filter((chunk) => chunk.type === "data-media"),
        ).toHaveLength(1);
    });
});
