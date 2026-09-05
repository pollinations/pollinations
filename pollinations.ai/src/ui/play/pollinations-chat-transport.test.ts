import type { ChatStreamChunk, Pollinations } from "@pollinations/sdk";
import { describe, expect, it } from "vitest";
import {
    messagesForPollinations,
    PollinationsChatTransport,
    type PollinationsUIMessage,
} from "./pollinations-chat-transport";

async function chunksFrom(events: ChatStreamChunk[]) {
    const client = {
        async *chatStream() {
            yield* events;
        },
    } as unknown as Pick<Pollinations, "chatStream">;
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
    it("normalizes tool markup and media into UI Message Stream chunks", async () => {
        const content =
            "Found it.\n\n" +
            '<details type="tool_calls" done="true" id="call-1" ' +
            'name="SEARCH_WEB" arguments="{&quot;query&quot;:&quot;flowers&quot;}">\n' +
            "<summary>Tool Executed</summary>\n" +
            "{&quot;count&quot;:1}\n</details>\n\n" +
            "![Result](<https://example.test/result.png>)";
        const chunks = await chunksFrom([
            contentChunk(content, "chunk-1"),
            {
                id: "chunk-2",
                object: "chat.completion.chunk",
                created: 1,
                model: "floret",
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            },
        ]);

        expect(chunks.map((chunk) => chunk.type)).toEqual([
            "start",
            "start-step",
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

    it("buffers tool markup split across provider chunks", async () => {
        const chunks = await chunksFrom([
            contentChunk("Found it.\n\n<det", "chunk-1"),
            contentChunk(
                'ails type="tool_calls" done="true" id="call-1" name="SEARCH_WEB" ',
                "chunk-2",
            ),
            contentChunk(
                'arguments="{&quot;query&quot;:&quot;flowers&quot;}"><summary>Tool Executed</summary>{&quot;count&quot;:1}</details>',
                "chunk-3",
            ),
        ]);

        expect(
            chunks.find((chunk) => chunk.type === "tool-input-available"),
        ).toMatchObject({
            toolCallId: "call-1",
            toolName: "SEARCH_WEB",
            input: { query: "flowers" },
        });
        expect(
            chunks
                .filter((chunk) => chunk.type === "text-delta")
                .map((chunk) => chunk.delta)
                .join(""),
        ).toBe("Found it.\n\n");
    });

    it("releases text held for a possible link at the next newline", async () => {
        const chunks = await chunksFrom([
            contentChunk("const a = [\n", "chunk-1"),
            contentChunk("  1,\n", "chunk-2"),
            contentChunk("];", "chunk-3"),
        ]);

        expect(
            chunks
                .filter((chunk) => chunk.type === "text-delta")
                .map((chunk) => chunk.delta),
        ).toEqual(["const a = ", "[\n", "  1,\n", "];"]);
    });

    it("buffers generated media links split across provider chunks", async () => {
        const chunks = await chunksFrom([
            contentChunk("![Res", "chunk-1"),
            contentChunk("ult](<https://example.test/result", "chunk-2"),
            contentChunk(".png>)", "chunk-3"),
        ]);

        expect(
            chunks.filter((chunk) => chunk.type === "data-media"),
        ).toHaveLength(1);
        expect(
            chunks.filter((chunk) => chunk.type === "text-delta"),
        ).toHaveLength(0);
    });
});
