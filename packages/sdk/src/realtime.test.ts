import { beforeEach, describe, expect, it } from "vitest";
import {
    connectRealtime,
    DEFAULT_REALTIME_MODEL,
    realtimeUrl,
} from "./realtime.js";
import { PollinationsError } from "./types.js";

class FakeSocket {
    static instances: FakeSocket[] = [];
    static OPEN = 1;

    url: string;
    readyState = 0;
    sent: string[] = [];
    closed = false;
    private listeners = new Map<string, ((event: unknown) => void)[]>();

    constructor(url: string) {
        this.url = url;
        FakeSocket.instances.push(this);
    }

    addEventListener(type: string, listener: (event: unknown) => void) {
        const list = this.listeners.get(type) ?? [];
        list.push(listener);
        this.listeners.set(type, list);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {
        this.closed = true;
        this.readyState = 3;
        this.emit("close", {});
    }

    emit(type: string, event: unknown) {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }

    open() {
        this.readyState = 1;
        this.emit("open", {});
    }

    message(payload: unknown) {
        this.emit("message", { data: JSON.stringify(payload) });
    }
}

const Socket = FakeSocket as unknown as typeof WebSocket;
const lastSocket = () => FakeSocket.instances[FakeSocket.instances.length - 1];

beforeEach(() => {
    FakeSocket.instances = [];
});

describe("realtimeUrl", () => {
    it("builds the wss URL with the default model and the key in the query", () => {
        const url = realtimeUrl({
            apiKey: "sk_abc",
            baseUrl: "https://gen.pollinations.ai/",
        });
        expect(url).toBe(
            `wss://gen.pollinations.ai/v1/realtime?model=${encodeURIComponent(DEFAULT_REALTIME_MODEL)}&key=sk_abc`,
        );
    });

    it("keeps a custom model and upgrades an http base to ws", () => {
        const url = realtimeUrl({
            apiKey: "sk_abc",
            model: "openai/gpt-live-transcribe",
            baseUrl: "http://localhost:8788",
        });
        expect(url).toBe(
            "ws://localhost:8788/v1/realtime?model=openai%2Fgpt-live-transcribe&key=sk_abc",
        );
    });

    it("rejects a missing key", () => {
        expect(() => realtimeUrl({ apiKey: "" })).toThrow(PollinationsError);
    });
});

describe("connectRealtime", () => {
    it("queues events until the socket opens, then sends the session first", () => {
        const session = connectRealtime({
            apiKey: "sk_abc",
            WebSocketImpl: Socket,
            session: { instructions: "Be brief." },
        });
        const socket = lastSocket();

        session.send({ type: "input_audio_buffer.append", audio: "AAA=" });
        expect(socket.sent).toEqual([]);

        socket.open();

        expect(socket.sent.map((data) => JSON.parse(data).type)).toEqual([
            "session.update",
            "input_audio_buffer.append",
        ]);
    });

    it("sends directly once open", () => {
        const session = connectRealtime({
            apiKey: "sk_abc",
            WebSocketImpl: Socket,
        });
        const socket = lastSocket();
        socket.open();

        session.updateSession({ voice: "alloy" });

        expect(JSON.parse(socket.sent[0])).toEqual({
            type: "session.update",
            session: { voice: "alloy" },
        });
    });

    it("passes typed events through and ignores other messages", () => {
        const events: unknown[] = [];
        connectRealtime({
            apiKey: "sk_abc",
            WebSocketImpl: Socket,
            onEvent: (event) => events.push(event),
        });
        const socket = lastSocket();

        socket.message({ type: "response.audio.delta", delta: "AAA=" });
        socket.emit("message", { data: "not json" });
        socket.message({ no_type: true });

        expect(events).toEqual([
            { type: "response.audio.delta", delta: "AAA=" },
        ]);
    });

    it("reports open, error and closed", () => {
        const seen: string[] = [];
        connectRealtime({
            apiKey: "sk_abc",
            WebSocketImpl: Socket,
            onStatus: (status) => seen.push(status),
        });
        const socket = lastSocket();

        socket.open();
        socket.emit("error", {});
        socket.close();

        expect(seen).toEqual(["open", "error", "closed"]);
    });

    it("closes once, including through an abort signal", () => {
        const controller = new AbortController();
        const session = connectRealtime({
            apiKey: "sk_abc",
            WebSocketImpl: Socket,
            signal: controller.signal,
        });
        const socket = lastSocket();

        controller.abort();
        session.close();

        expect(socket.closed).toBe(true);
    });

    it("throws when the runtime has no WebSocket", () => {
        const original = globalThis.WebSocket;
        // @ts-expect-error - remove the global WebSocket for this test
        globalThis.WebSocket = undefined;
        try {
            expect(() => connectRealtime({ apiKey: "sk_abc" })).toThrow(
                PollinationsError,
            );
        } finally {
            globalThis.WebSocket = original;
        }
    });
});
