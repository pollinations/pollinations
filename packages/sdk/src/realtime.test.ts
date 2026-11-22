import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    base64ToPcm16,
    connectRealtime,
    pcm16ToBase64,
    type RealtimeEvent,
} from "./realtime.js";

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];

    url: string;
    sent: string[] = [];
    closed = false;
    onopen: (() => void) | null = null;
    onmessage: ((message: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;

    constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {
        this.closed = true;
        this.onclose?.({ code: 1000 });
    }

    open() {
        this.onopen?.();
    }

    receive(data: unknown) {
        this.onmessage?.({ data });
    }

    fail() {
        this.onerror?.();
    }
}

function lastSocket(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("connectRealtime", () => {
    it("builds the gateway URL with the model and key as query params", () => {
        connectRealtime({
            apiKey: "sk_test",
            baseUrl: "https://example.test/",
            onEvent: () => {},
        });

        expect(lastSocket().url).toBe(
            "wss://example.test/v1/realtime?model=openai%2Fgpt-realtime-2.1&key=sk_test",
        );
    });

    it("defaults to the public gateway and accepts a transcription model", () => {
        connectRealtime({
            apiKey: "sk_test",
            model: "elevenlabs/scribe-v2-realtime",
            onEvent: () => {},
        });

        expect(lastSocket().url).toBe(
            "wss://gen.pollinations.ai/v1/realtime?model=elevenlabs%2Fscribe-v2-realtime&key=sk_test",
        );
    });

    it("sends session.update on open, before events queued while connecting", () => {
        const session = connectRealtime({
            apiKey: "sk_test",
            session: {
                voice: "alloy",
                transcriptionModel: "elevenlabs/scribe-v2-realtime",
                turnDetection: null,
            },
            onEvent: () => {},
        });
        session.send({ type: "response.create" });
        session.appendAudio(new Int16Array([1, -1]));

        const socket = lastSocket();
        expect(socket.sent).toEqual([]);
        socket.open();

        const frames = socket.sent.map((data) => JSON.parse(data));
        expect(frames[0]).toEqual({
            type: "session.update",
            session: {
                audio: {
                    input: {
                        format: { type: "audio/pcm", rate: 24000 },
                        turn_detection: null,
                        transcription: {
                            model: "elevenlabs/scribe-v2-realtime",
                        },
                    },
                    output: {
                        format: { type: "audio/pcm", rate: 24000 },
                        voice: "alloy",
                    },
                },
            },
        });
        expect(frames[1]).toEqual({ type: "response.create" });
        expect(frames[2]).toEqual({
            type: "input_audio_buffer.append",
            audio: pcm16ToBase64(new Int16Array([1, -1])),
        });
    });

    it("updateSession and commitAudio send their events once open", () => {
        const session = connectRealtime({
            apiKey: "sk_test",
            onEvent: () => {},
        });
        const socket = lastSocket();
        socket.open();

        session.updateSession({ instructions: "Be brief." });
        session.commitAudio();

        const frames = socket.sent.map((data) => JSON.parse(data));
        expect(frames[0].type).toBe("session.update");
        expect(frames[0].session.instructions).toBe("Be brief.");
        expect(frames[1]).toEqual({ type: "input_audio_buffer.commit" });
    });

    it("passes parsed events to onEvent and ignores non-event frames", () => {
        const events: RealtimeEvent[] = [];
        connectRealtime({
            apiKey: "sk_test",
            onEvent: (event) => events.push(event),
        });
        const socket = lastSocket();
        socket.open();

        socket.receive(
            JSON.stringify({ type: "session.created", session: { id: "s1" } }),
        );
        socket.receive("not json");
        socket.receive(JSON.stringify({ noType: true }));
        socket.receive(new ArrayBuffer(2));

        expect(events).toEqual([
            { type: "session.created", session: { id: "s1" } },
        ]);
    });

    it("reports socket errors and closes through the session", () => {
        const onError = vi.fn();
        const onClose = vi.fn();
        const session = connectRealtime({
            apiKey: "sk_test",
            onEvent: () => {},
            onError,
            onClose,
        });
        const socket = lastSocket();

        socket.fail();
        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);

        session.close();
        expect(socket.closed).toBe(true);
        expect(onClose).toHaveBeenCalledOnce();
    });
});

describe("pcm16 base64 helpers", () => {
    it("round-trips samples, including the extremes", () => {
        const samples = new Int16Array([0, 1, -1, 32767, -32768, 12345]);
        expect(base64ToPcm16(pcm16ToBase64(samples))).toEqual(samples);
    });
});
