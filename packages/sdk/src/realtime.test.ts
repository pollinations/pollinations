import { afterEach, describe, expect, it, vi } from "vitest";
import { connectRealtime } from "./realtime.js";

class FakeWebSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    static instances: FakeWebSocket[] = [];

    readonly url: string;
    readyState = FakeWebSocket.CONNECTING;
    sent: string[] = [];
    closeCalls = 0;

    constructor(url: string | URL) {
        super();
        this.url = String(url);
        FakeWebSocket.instances.push(this);
    }

    open() {
        this.readyState = FakeWebSocket.OPEN;
        this.dispatchEvent(new Event("open"));
    }

    send(data: string) {
        if (this.readyState !== FakeWebSocket.OPEN) {
            throw new Error("socket is not open");
        }
        this.sent.push(data);
    }

    close() {
        this.closeCalls += 1;
        this.readyState = FakeWebSocket.CLOSING;
        queueMicrotask(() => {
            this.readyState = FakeWebSocket.CLOSED;
            const event = new Event("close");
            Object.defineProperties(event, {
                code: { value: 1000 },
                reason: { value: "closed" },
            });
            this.dispatchEvent(event);
        });
    }

    message(data: string) {
        this.dispatchEvent(new MessageEvent("message", { data }));
    }
}

const nativeWebSocket = globalThis.WebSocket;

afterEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", nativeWebSocket);
    vi.useRealTimers();
});

describe("connectRealtime", () => {
    it("connects with the documented URL and sends session.update first", async () => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
        const onEvent = vi.fn();
        const opening = connectRealtime({
            apiKey: "sk_test",
            baseUrl: "https://gateway.example/ai/",
            session: { type: "realtime", instructions: "Be concise." },
            onEvent,
        });
        const socket = FakeWebSocket.instances[0];
        const url = new URL(socket.url);

        expect(url.origin + url.pathname).toBe(
            "wss://gateway.example/ai/v1/realtime",
        );
        expect(url.searchParams.get("key")).toBe("sk_test");
        expect(url.searchParams.get("model")).toBe("openai/gpt-realtime-2.1");

        socket.open();
        const session = await opening;
        expect(JSON.parse(socket.sent[0])).toEqual({
            type: "session.update",
            session: { type: "realtime", instructions: "Be concise." },
        });

        session.send({ type: "input_audio_buffer.commit" });
        expect(JSON.parse(socket.sent[1])).toEqual({
            type: "input_audio_buffer.commit",
        });

        socket.message('{"type":"response.done","response":{"id":"r1"}}');
        expect(onEvent).toHaveBeenCalledWith({
            type: "response.done",
            response: { id: "r1" },
        });

        session.close();
        await expect(session.closed).resolves.toEqual({
            code: 1000,
            reason: "closed",
        });
    });

    it.each(["pk_app", "sess_example", "", "not-a-secret-key"])(
        "rejects a non-secret key before opening a socket (%s)",
        async (apiKey) => {
            vi.stubGlobal("WebSocket", FakeWebSocket);
            await expect(
                connectRealtime({ apiKey, onEvent: () => {} }),
            ).rejects.toMatchObject({ code: "INVALID_INPUT" });
            expect(FakeWebSocket.instances).toHaveLength(0);
        },
    );

    it("rejects when the socket closes before opening", async () => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
        const opening = connectRealtime({
            apiKey: "sk_test",
            onEvent: () => {},
        });
        const socket = FakeWebSocket.instances[0];
        socket.close();
        await expect(opening).rejects.toThrow("closed before opening");
    });

    it("closes and rejects a pending connection when aborted", async () => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
        const controller = new AbortController();
        const opening = connectRealtime({
            apiKey: "sk_test",
            onEvent: () => {},
            signal: controller.signal,
        });
        const socket = FakeWebSocket.instances[0];

        controller.abort(new Error("cancelled"));

        await expect(opening).rejects.toThrow("cancelled");
        expect(socket.closeCalls).toBe(1);
    });

    it("rejects a failed handshake", async () => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
        const opening = connectRealtime({
            apiKey: "sk_test",
            onEvent: () => {},
        });
        const socket = FakeWebSocket.instances[0];
        socket.dispatchEvent(new Event("error"));
        await expect(opening).rejects.toThrow(
            "Realtime WebSocket connection failed",
        );
    });

    it("times out and closes a socket that never opens", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocket", FakeWebSocket);
        const opening = connectRealtime({
            apiKey: "sk_test",
            onEvent: () => {},
            timeoutMs: 10,
        });
        const socket = FakeWebSocket.instances[0];
        const rejected = expect(opening).rejects.toThrow(
            "timed out after 10ms",
        );

        await vi.advanceTimersByTimeAsync(10);

        await rejected;
        expect(socket.closeCalls).toBe(1);
    });

    it("closes an open session when its signal is aborted", async () => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
        const controller = new AbortController();
        const opening = connectRealtime({
            apiKey: "sk_test",
            onEvent: () => {},
            signal: controller.signal,
        });
        const socket = FakeWebSocket.instances[0];
        socket.open();
        const session = await opening;

        controller.abort();

        await expect(session.closed).resolves.toEqual({
            code: 1000,
            reason: "closed",
        });
        expect(socket.closeCalls).toBe(1);
    });
});
