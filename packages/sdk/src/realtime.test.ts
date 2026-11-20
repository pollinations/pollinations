import { describe, expect, it } from "vitest";
import { Pollinations } from "./client.js";
import {
    buildRealtimeUrl,
    createRealtimeSession,
    type RealtimeEvent,
    type RealtimeWebSocket,
} from "./realtime.js";
import { PollinationsError } from "./types.js";

class FakeWebSocket implements RealtimeWebSocket {
    static instances: FakeWebSocket[] = [];

    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onclose: (() => void) | null = null;
    readyState = 0;
    sent: string[] = [];
    closed = false;

    constructor(public url: string) {
        FakeWebSocket.instances.push(this);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {
        this.closed = true;
        this.readyState = 3;
        this.onclose?.();
    }

    // Test helpers
    open() {
        this.readyState = 1;
        this.onopen?.({});
    }

    emit(event: RealtimeEvent) {
        this.onmessage?.({ data: JSON.stringify(event) });
    }

    fail(event: unknown) {
        this.onerror?.(event);
    }
}

const key = { apiKey: "sk_test 123" };

describe("buildRealtimeUrl", () => {
    it("targets /v1/realtime with the default model and the key", () => {
        const url = buildRealtimeUrl(key);
        expect(url).toBe(
            "wss://gen.pollinations.ai/v1/realtime?model=openai%2Fgpt-realtime-2.1&key=sk_test+123",
        );
    });

    it("honours a custom model and http base URL", () => {
        const url = buildRealtimeUrl({
            ...key,
            model: "elevenlabs/scribe-v3-live",
            baseUrl: "http://localhost:8788/",
        });
        expect(url.startsWith("ws://localhost:8788/v1/realtime?")).toBe(true);
        expect(url).toContain("model=elevenlabs%2Fscribe-v3-live");
    });
});

describe("createRealtimeSession", () => {
    it("resolves ready on open, passes server events to onEvent and sends client events", async () => {
        const events: RealtimeEvent[] = [];
        const session = createRealtimeSession({
            ...key,
            WebSocket: FakeWebSocket,
            onEvent: (event) => events.push(event),
        });
        const ws = FakeWebSocket.instances.at(-1)!;
        ws.open();
        await session.ready;

        ws.emit({ type: "session.created", session: { id: "s1" } });
        expect(events).toEqual([
            { type: "session.created", session: { id: "s1" } },
        ]);

        session.send({ type: "session.update", session: { instructions: "Hi" } });
        expect(JSON.parse(ws.sent[0])).toEqual({
            type: "session.update",
            session: { instructions: "Hi" },
        });
    });

    it("rejects send before the socket is open", () => {
        const session = createRealtimeSession({
            ...key,
            WebSocket: FakeWebSocket,
        });
        expect(() => session.send({ type: "session.update" })).toThrow(
            PollinationsError,
        );
    });

    it("rejects ready when the first connection errors", async () => {
        const session = createRealtimeSession({
            ...key,
            WebSocket: FakeWebSocket,
        });
        const ws = FakeWebSocket.instances.at(-1)!;
        ws.fail(new Error("boom"));
        await expect(session.ready).rejects.toThrow("boom");
    });

    it("close() closes the socket and reports via onClose", async () => {
        let closed = false;
        const session = createRealtimeSession({
            ...key,
            WebSocket: FakeWebSocket,
            onClose: () => {
                closed = true;
            },
        });
        const ws = FakeWebSocket.instances.at(-1)!;
        ws.open();
        await session.ready;
        session.close();
        expect(ws.closed).toBe(true);
        expect(closed).toBe(true);
    });

    it("client.realtime() injects the client's key and base URL", () => {
        const client = new Pollinations({
            apiKey: "sk_client",
            baseUrl: "https://gen.pollinations.ai",
        });
        client.realtime({ WebSocket: FakeWebSocket });
        const ws = FakeWebSocket.instances.at(-1)!;
        expect(ws.url).toContain("key=sk_client");
        expect(ws.url.startsWith("wss://gen.pollinations.ai/v1/realtime?")).toBe(
            true,
        );
    });
});
