import { describe, expect, it } from "vitest";
import { buildRealtimeUrl, createRealtimeSession } from "./realtime.js";

class FakeWebSocket {
    static OPEN = 1;
    static instances: FakeWebSocket[] = [];
    readyState = 0;
    sent: string[] = [];
    private listeners = new Map<string, ((event: never) => void)[]>();

    constructor(public url: string) {
        FakeWebSocket.instances.push(this);
    }

    addEventListener(type: string, handler: (event: never) => void) {
        const list = this.listeners.get(type) ?? [];
        list.push(handler);
        this.listeners.set(type, list);
    }

    emit(type: string, event: unknown) {
        for (const handler of this.listeners.get(type) ?? []) {
            handler(event as never);
        }
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {
        this.readyState = 3;
        this.emit("close", {});
    }

    open() {
        this.readyState = FakeWebSocket.OPEN;
        this.emit("open", {});
    }
}

describe("buildRealtimeUrl", () => {
    it("builds the default wss URL with model and key", () => {
        expect(buildRealtimeUrl({ apiKey: "sk_test" })).toBe(
            "wss://gen.pollinations.ai/v1/realtime?model=openai%2Fgpt-realtime-2.1&key=sk_test",
        );
    });

    it("honours a custom base URL and model", () => {
        expect(
            buildRealtimeUrl({
                baseUrl: "http://localhost:8788/",
                model: "google/gemini-3.8-live",
            }),
        ).toBe(
            "ws://localhost:8788/v1/realtime?model=google%2Fgemini-3.8-live",
        );
    });
});

describe("createRealtimeSession", () => {
    it("sends session.update on open and passes events through", async () => {
        FakeWebSocket.instances = [];
        const session = createRealtimeSession({
            apiKey: "sk_test",
            session: { type: "realtime", instructions: "Be concise." },
            webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
        });
        const socket = FakeWebSocket.instances[0];
        const seen: string[] = [];
        session.on((event) => seen.push(event.type));
        session.send({ type: "response.create" });
        socket.open();
        await session.ready;
        expect(JSON.parse(socket.sent[0])).toEqual({
            type: "session.update",
            session: { type: "realtime", instructions: "Be concise." },
        });
        expect(JSON.parse(socket.sent[1])).toEqual({
            type: "response.create",
        });
        socket.emit("message", {
            data: JSON.stringify({ type: "response.done" }),
        });
        expect(seen).toEqual(["response.done"]);
        session.close();
    });
});
