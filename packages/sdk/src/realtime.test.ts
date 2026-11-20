import { describe, expect, it, vi } from "vitest";
import {
    base64ToPcm16,
    connectRealtime,
    DEFAULT_REALTIME_MODEL,
    pcm16ToBase64,
} from "./realtime.js";

class MockWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;
    url: string;
    sent: string[] = [];
    listeners = new Map<string, Set<(evt: unknown) => void>>();

    constructor(url: string) {
        this.url = url;
    }

    addEventListener(type: string, handler: (evt: unknown) => void) {
        let set = this.listeners.get(type);
        if (!set) {
            set = new Set();
            this.listeners.set(type, set);
        }
        set.add(handler);
    }

    removeEventListener(type: string, handler: (evt: unknown) => void) {
        this.listeners.get(type)?.delete(handler);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close(code = 1000, reason = "") {
        this.readyState = MockWebSocket.CLOSED;
        this.emit("close", { code, reason });
    }

    emit(type: string, data: unknown) {
        this.listeners.get(type)?.forEach((h) => {
            h(data);
        });
    }

    triggerOpen() {
        this.readyState = MockWebSocket.OPEN;
        this.emit("open", {});
    }

    triggerMessage(data: unknown) {
        this.emit("message", {
            data: typeof data === "string" ? data : JSON.stringify(data),
        });
    }

    triggerError(error: unknown) {
        this.emit("error", error);
    }
}

describe("Realtime Audio Helpers", () => {
    it("converts PCM16 samples to base64 and back", () => {
        const samples = new Int16Array([0, 1000, -1000, 32767, -32768]);
        const base64 = pcm16ToBase64(samples);
        expect(typeof base64).toBe("string");

        const decoded = base64ToPcm16(base64);
        expect(decoded.length).toBe(samples.length);
        expect(Array.from(decoded)).toEqual(Array.from(samples));
    });
});

describe("connectRealtime", () => {
    it("connects with default model and baseUrl", () => {
        let createdUrl = "";
        class CustomMockWS extends MockWebSocket {
            constructor(url: string) {
                super(url);
                createdUrl = url;
            }
        }

        const session = connectRealtime({
            apiKey: "sk_test_123",
            WebSocketClass: CustomMockWS as unknown as typeof WebSocket,
        });

        expect(session.status).toBe("connecting");
        const url = new URL(createdUrl);
        expect(url.origin).toBe("wss://gen.pollinations.ai");
        expect(url.pathname).toBe("/v1/realtime");
        expect(url.searchParams.get("model")).toBe(DEFAULT_REALTIME_MODEL);
        expect(url.searchParams.get("key")).toBe("sk_test_123");
    });

    it("queues messages sent before open and flushes on open", () => {
        let wsInstance: MockWebSocket | undefined;
        class CustomMockWS extends MockWebSocket {
            constructor(url: string) {
                super(url);
                wsInstance = this;
            }
        }

        const session = connectRealtime({
            apiKey: "sk_test",
            WebSocketClass: CustomMockWS as unknown as typeof WebSocket,
        });

        session.send({ type: "session.update", session: { voice: "alloy" } });
        expect(wsInstance?.sent.length).toBe(0);

        wsInstance?.triggerOpen();
        expect(session.status).toBe("connected");
        expect(wsInstance?.sent.length).toBe(1);
        const first = wsInstance?.sent[0];
        expect(first ? JSON.parse(first).type : "").toBe("session.update");
    });

    it("dispatches typed server events and wildcard events", () => {
        let wsInstance: MockWebSocket | undefined;
        class CustomMockWS extends MockWebSocket {
            constructor(url: string) {
                super(url);
                wsInstance = this;
            }
        }

        const session = connectRealtime({
            WebSocketClass: CustomMockWS as unknown as typeof WebSocket,
        });
        wsInstance?.triggerOpen();

        const onDelta = vi.fn();
        const onWildcard = vi.fn();

        session.on("response.audio.delta", onDelta);
        session.on("*", onWildcard);

        wsInstance?.triggerMessage({
            type: "response.audio.delta",
            delta: "AAAA",
        });

        expect(onDelta).toHaveBeenCalledWith({
            type: "response.audio.delta",
            delta: "AAAA",
        });
        expect(onWildcard).toHaveBeenCalledWith({
            type: "response.audio.delta",
            delta: "AAAA",
        });
    });

    it("sends audio chunks via sendAudio helper", () => {
        let wsInstance: MockWebSocket | undefined;
        class CustomMockWS extends MockWebSocket {
            constructor(url: string) {
                super(url);
                wsInstance = this;
            }
        }

        const session = connectRealtime({
            WebSocketClass: CustomMockWS as unknown as typeof WebSocket,
        });
        wsInstance?.triggerOpen();

        const pcm = new Int16Array([500, -500]);
        session.sendAudio(pcm);

        expect(wsInstance?.sent.length).toBe(1);
        const item = wsInstance?.sent[0];
        const parsed = item ? JSON.parse(item) : {};
        expect(parsed.type).toBe("input_audio_buffer.append");
        expect(typeof parsed.audio).toBe("string");
    });
});
