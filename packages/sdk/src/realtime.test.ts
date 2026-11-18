import { describe, expect, it } from "vitest";
import { connectRealtime, realtimeUrl } from "./realtime.js";

type Listener = (event: unknown) => void;

class FakeSocket {
    static last: FakeSocket;
    sent: string[] = [];
    closed: number | undefined;
    private listeners: Record<string, Listener[]> = {};
    constructor(public url: string) {
        FakeSocket.last = this;
    }
    addEventListener(type: string, listener: Listener) {
        this.listeners[type] = [...(this.listeners[type] ?? []), listener];
    }
    emit(type: string, event: unknown = {}) {
        for (const listener of this.listeners[type] ?? []) listener(event);
    }
    send(data: string) {
        this.sent.push(data);
    }
    close(code: number) {
        this.closed = code;
        this.emit("close", { code, reason: "bye" });
    }
}

const Socket = FakeSocket as unknown as typeof WebSocket;

describe("realtimeUrl", () => {
    it("targets /v1/realtime over wss with the model and the key", () => {
        const url = new URL(
            realtimeUrl({
                apiKey: "sk_abc",
                model: "openai/gpt-realtime-2.1-mini",
            }),
        );
        expect(url.origin).toBe("wss://gen.pollinations.ai");
        expect(url.pathname).toBe("/v1/realtime");
        expect(url.searchParams.get("model")).toBe(
            "openai/gpt-realtime-2.1-mini",
        );
        expect(url.searchParams.get("key")).toBe("sk_abc");
    });

    it("defaults to gpt-realtime-2.1 and follows a custom base URL", () => {
        const url = new URL(
            realtimeUrl({ apiKey: "sk_abc", baseUrl: "http://localhost:8788" }),
        );
        expect(url.protocol).toBe("ws:");
        expect(url.host).toBe("localhost:8788");
        expect(url.searchParams.get("model")).toBe("openai/gpt-realtime-2.1");
    });
});

describe("connectRealtime", () => {
    it("resolves when the socket opens, passes server events through and sends client events as JSON", async () => {
        const events: unknown[] = [];
        const pending = connectRealtime({
            apiKey: "sk_abc",
            onEvent: (e) => events.push(e),
            WebSocket: Socket,
        });
        FakeSocket.last.emit("open");
        const session = await pending;

        FakeSocket.last.emit("message", {
            data: JSON.stringify({
                type: "session.created",
                session: { id: "s1" },
            }),
        });
        FakeSocket.last.emit("message", { data: new ArrayBuffer(4) }); // not JSON: ignored
        expect(events).toEqual([
            { type: "session.created", session: { id: "s1" } },
        ]);

        session.send({ type: "response.create" });
        expect(FakeSocket.last.sent).toEqual(['{"type":"response.create"}']);
    });

    it("rejects when the socket cannot open", async () => {
        const pending = connectRealtime({
            apiKey: "sk_abc",
            WebSocket: Socket,
        });
        FakeSocket.last.emit("error");
        await expect(pending).rejects.toThrow(
            "Could not open the realtime session.",
        );
    });

    it("closes normally and reports the close once", async () => {
        const closes: unknown[] = [];
        const pending = connectRealtime({
            apiKey: "sk_abc",
            onClose: (e) => closes.push(e),
            WebSocket: Socket,
        });
        FakeSocket.last.emit("open");
        (await pending).close();
        expect(FakeSocket.last.closed).toBe(1000);
        expect(closes).toEqual([{ code: 1000, reason: "bye" }]);
    });
});
