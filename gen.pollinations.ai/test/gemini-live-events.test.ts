import { describe, expect, it, vi } from "vitest";
import { createGeminiLiveEvents } from "../src/routes/geminiLiveEvents.ts";

function session() {
    const sendClient = vi.fn();
    const sendGoogle = vi.fn();
    const onUsage = vi.fn();
    const requestSetup = vi.fn();
    const cancelUnsentTurn = vi.fn(() => false);
    const adapter = createGeminiLiveEvents({
        model: "google/gemini-3.8-live",
        sendClient,
        sendGoogle,
        requestSetup,
        cancelUnsentTurn,
        onUsage,
    });
    return {
        ...adapter,
        requestSetup,
        cancelUnsentTurn,
        sendClient,
        sendGoogle,
        onUsage,
        events: () => sendClient.mock.calls.map(([event]) => event),
    };
}
const usage = {
    promptTokenCount: 2,
    promptTokensDetails: [{ modality: "TEXT", tokenCount: 2 }],
    candidatesTokenCount: 3,
    candidatesTokensDetails: [{ modality: "AUDIO", tokenCount: 3 }],
    thoughtsTokenCount: 1,
    totalTokenCount: 6,
};
const terminal = {
    serverContent: { turnComplete: true },
    usageMetadata: usage,
};
const textItem = {
    type: "conversation.item.create",
    item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Hello" }],
    },
};
describe("Gemini Live realtime events", () => {
    it("accumulates media and text until response.create, then correlates deltas and terminal usage", () => {
        const s = session();
        s.start();
        s.client({
            ...textItem,
            item: {
                ...textItem.item,
                content: [
                    {
                        type: "input_image",
                        image_url: "data:image/jpeg;base64,AAAA",
                    },
                    ...textItem.item.content,
                ],
            },
        });
        expect(s.sendGoogle).not.toHaveBeenCalled();
        s.client({ type: "response.create" });
        expect(s.sendGoogle.mock.calls).toEqual([
            [
                {
                    realtimeInput: {
                        video: { mimeType: "image/jpeg", data: "AAAA" },
                    },
                },
            ],
            [{ realtimeInput: { text: "Hello" } }],
        ]);
        expect(s.pendingTurn()).toBe(true);
        s.google({
            serverContent: {
                modelTurn: {
                    parts: [
                        {
                            inlineData: {
                                mimeType: "audio/pcm;rate=24000",
                                data: "AAAA",
                            },
                        },
                    ],
                },
                outputTranscription: { text: "Hi" },
            },
        });
        s.google(terminal);
        const events = s.events();
        const responseId = events.find((e) => e.type === "response.created")
            .response.id;
        const itemId = events.find(
            (e) => e.type === "response.output_item.added",
        ).item.id;
        expect(events).toContainEqual(
            expect.objectContaining({
                type: "response.output_audio.delta",
                delta: "AAAA",
                response_id: responseId,
                item_id: itemId,
            }),
        );
        expect(events.at(-1)).toMatchObject({
            type: "response.done",
            response: {
                id: responseId,
                status: "completed",
                usage: { input_tokens: 2, output_tokens: 4, total_tokens: 6 },
                output: [
                    {
                        id: itemId,
                        content: [{ type: "output_audio", transcript: "Hi" }],
                    },
                ],
            },
        });
        expect(s.pendingTurn()).toBe(false);
        expect(s.onUsage).toHaveBeenCalledExactlyOnceWith({
            promptTextTokens: 2,
            completionAudioTokens: 3,
            completionReasoningTokens: 1,
        });
    });
    it("validates PCM input, clears pending samples and commits a manually ended turn", () => {
        const s = session();
        s.client({ type: "input_audio_buffer.append", audio: "AQ==" });
        expect(s.events().at(-1)).toMatchObject({ type: "error" });
        s.client({ type: "input_audio_buffer.append", audio: "AAAAAA==" });
        s.client({ type: "input_audio_buffer.clear" });
        s.client({ type: "input_audio_buffer.commit" });
        expect(s.events().at(-1)).toMatchObject({ type: "error" });
        s.client({ type: "input_audio_buffer.append", audio: "AQI=" });
        s.client({ type: "input_audio_buffer.commit" });
        s.client({ type: "response.create" });
        expect(s.sendGoogle.mock.calls).toEqual([
            [{ realtimeInput: { activityStart: {} } }],
            [
                {
                    realtimeInput: {
                        audio: {
                            mimeType: "audio/pcm;rate=24000",
                            data: "AQI=",
                        },
                    },
                },
            ],
            [{ realtimeInput: { activityEnd: {} } }],
        ]);
    });
    it("commits all audio already accepted at the pending-input limit", () => {
        const s = session();
        const audio = btoa("\0".repeat(6144)); // 8 KiB of encoded PCM per chunk
        for (let i = 0; i < 1024; i++)
            s.client({ type: "input_audio_buffer.append", audio });
        expect(s.events()).toEqual([]);
        s.client({ type: "input_audio_buffer.append", audio: "AAA=" });
        expect(s.events().at(-1)).toMatchObject({ type: "error" });
        s.client({ type: "input_audio_buffer.commit" });
        s.client({ type: "response.create" });
        expect(s.sendGoogle).toHaveBeenCalledTimes(1026);
        expect(s.sendGoogle.mock.lastCall).toEqual([
            { realtimeInput: { activityEnd: {} } },
        ]);
    });
    it("keeps function identifiers and submits results on the next response", () => {
        const s = session();
        s.client({
            type: "session.update",
            session: {
                instructions: "Use tools",
                tools: [
                    {
                        type: "function",
                        name: "lookup",
                        parameters: { type: "object" },
                    },
                ],
            },
        });
        expect(s.setup("upstream")).toMatchObject({
            setup: {
                systemInstruction: { parts: [{ text: "Use tools" }] },
                tools: [
                    {
                        functionDeclarations: [
                            {
                                name: "lookup",
                                parametersJsonSchema: { type: "object" },
                            },
                        ],
                    },
                ],
            },
        });
        s.client(textItem);
        s.client({ type: "response.create" });
        s.google({
            toolCall: {
                functionCalls: [
                    { id: "call-1", name: "lookup", args: { q: "a" } },
                ],
            },
        });
        s.google(terminal);
        expect(s.events()).toContainEqual(
            expect.objectContaining({
                type: "response.function_call_arguments.done",
                call_id: "call-1",
                arguments: JSON.stringify({ q: "a" }),
            }),
        );
        s.client({
            type: "conversation.item.create",
            item: {
                type: "function_call_output",
                call_id: "call-1",
                output: '{"value":2}',
            },
        });
        s.client({ type: "response.create" });
        expect(s.sendGoogle.mock.lastCall).toEqual([
            {
                toolResponse: {
                    functionResponses: [
                        {
                            id: "call-1",
                            name: "lookup",
                            response: { result: { value: 2 } },
                        },
                    ],
                },
            },
        ]);
    });
    it("keeps setup instructions and tools after a rejected in-flight update", () => {
        const s = session();
        const config = {
            instructions: "Use lookup",
            tools: [{ type: "function", name: "lookup" }],
        };
        s.client({ type: "session.update", session: config });
        s.client(textItem);
        s.client({ type: "response.create" });
        const setup = s.setup("upstream");
        s.sendGoogle.mockClear();
        for (const change of [{ instructions: "" }, { tools: [] }]) {
            s.client({ type: "session.update", session: change });
            expect(s.events().at(-1)).toMatchObject({
                type: "error",
                error: { code: "invalid_event" },
            });
        }
        expect(s.setup("upstream")).toEqual(setup);
        expect(s.sendGoogle).not.toHaveBeenCalled();
        s.google(terminal);
        expect(s.events().at(-1)).toMatchObject({ type: "response.done" });
    });

    it("rejects automatic turn detection and buffers audio until committed", () => {
        const s = session();
        s.client({
            type: "session.update",
            session: {
                audio: { input: { turn_detection: { type: "server_vad" } } },
            },
        });
        expect(s.events().at(-1)).toMatchObject({ type: "error" });
        s.client({ type: "input_audio_buffer.append", audio: "AQI=" });
        expect(s.requestSetup).not.toHaveBeenCalled();
        expect(s.sendGoogle).not.toHaveBeenCalled();
        expect(
            s.setup("gemini").setup.realtimeInputConfig
                .automaticActivityDetection.disabled,
        ).toBe(true);
    });

    it.each(["typed", "audio"])(
        "continues with %s input after a Vertex interruption",
        (kind) => {
            const s = session();
            s.client(textItem);
            s.client({ type: "response.create" });
            s.google({
                serverContent: { outputTranscription: { text: "Hello" } },
            });
            s.sendGoogle.mockClear();
            s.client({ type: "response.cancel" });
            s.client({ type: "response.cancel" });
            expect(s.sendGoogle.mock.calls).toEqual([
                [{ realtimeInput: { activityStart: {} } }],
            ]);
            s.google({ serverContent: { interrupted: true } });
            expect(s.onUsage).not.toHaveBeenCalled();
            s.google(terminal);
            s.sendGoogle.mockClear();
            if (kind === "typed") {
                s.client(textItem);
                s.client({ type: "response.create" });
                expect(s.sendGoogle.mock.calls).toEqual([
                    [
                        {
                            realtimeInput: {
                                audio: {
                                    data: btoa("\0".repeat(960)),
                                    mimeType: "audio/pcm;rate=24000",
                                },
                            },
                        },
                    ],
                    [{ realtimeInput: { text: "Hello" } }],
                    [{ realtimeInput: { activityEnd: {} } }],
                ]);
            } else {
                s.client({ type: "input_audio_buffer.append", audio: "AQI=" });
                s.client({ type: "input_audio_buffer.commit" });
                s.client({ type: "response.create" });
                expect(s.sendGoogle.mock.calls).toEqual([
                    [
                        {
                            realtimeInput: {
                                audio: {
                                    data: "AQI=",
                                    mimeType: "audio/pcm;rate=24000",
                                },
                            },
                        },
                    ],
                    [{ realtimeInput: { activityEnd: {} } }],
                ]);
            }
            s.google(terminal);
            expect(s.onUsage).toHaveBeenCalledTimes(2);
            expect(
                s
                    .events()
                    .filter((e) => e.type === "response.done")
                    .map((e) => e.response.status),
            ).toEqual(["cancelled", "completed"]);
        },
    );

    it("cancels a queued turn without sending input or recording provider usage", () => {
        const s = session();
        s.cancelUnsentTurn.mockReturnValue(true);
        s.client(textItem);
        s.client({ type: "response.create" });
        s.client({ type: "response.cancel" });
        expect(s.pendingTurn()).toBe(false);
        expect(s.events().at(-1)).toMatchObject({
            type: "response.done",
            response: { status: "cancelled", usage: null },
        });
        expect(s.onUsage).not.toHaveBeenCalled();
    });

    it("reports completion if generation finished before Vertex received the interrupt", () => {
        const s = session();
        s.client(textItem);
        s.client({ type: "response.create" });
        s.client({ type: "response.cancel" });
        s.google(terminal);
        expect(s.events().at(-1)).toMatchObject({
            type: "response.done",
            response: { status: "completed" },
        });
        expect(s.onUsage).toHaveBeenCalledOnce();
    });

    it("suppresses cancelled output and requires reconciled usage to complete", () => {
        const s = session();
        s.client(textItem);
        s.client({ type: "response.create" });
        s.sendGoogle.mockClear();
        s.client({ type: "response.cancel" });
        expect(s.sendGoogle).not.toHaveBeenCalled();
        s.google({
            serverContent: { modelTurn: { parts: [{ text: "late" }] } },
        });
        expect(s.sendGoogle).toHaveBeenCalledExactlyOnceWith({
            realtimeInput: { activityStart: {} },
        });
        expect(
            s.events().some((e) => e.type === "response.output_text.delta"),
        ).toBe(false);
        expect(() =>
            s.google({ serverContent: { turnComplete: true } }),
        ).toThrow(/usage/);
        expect(s.onUsage).not.toHaveBeenCalled();
        expect(s.pendingTurn()).toBe(true);
        s.google({ serverContent: { interrupted: true } });
        s.google(terminal);
        expect(s.events().at(-1)).toMatchObject({
            type: "response.done",
            response: { status: "cancelled" },
        });
    });
});
