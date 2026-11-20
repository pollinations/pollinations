import { afterEach, describe, expect, it, vi } from "vitest";
import { connectRealtime, RealtimeSession, realtimeUrl } from "./realtime.js";

/** A WebSocket stand-in the test drives by hand. */
class FakeSocket {
    static instances: FakeSocket[] = [];
    readonly listeners = new Map<string, Set<(event: unknown) => void>>();
    readonly sent: string[] = [];
    closed = false;
    readyState = 0;

    constructor(readonly url: string) {
        FakeSocket.instances.push(this);
    }

    addEventListener(type: string, handler: (event: unknown) => void): void {
        const handlers = this.listeners.get(type) ?? new Set();
        handlers.add(handler);
        this.listeners.set(type, handlers);
    }

    send(payload: string): void {
        if (this.closed) throw new Error("send after close");
        this.sent.push(payload);
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.readyState = 3;
        this.emit("close", { code: 1000, reason: "" });
    }

    emit(type: string, event: unknown): void {
        for (const handler of this.listeners.get(type) ?? []) handler(event);
    }

    open(): void {
        this.readyState = 1;
        this.emit("open", {});
    }

    message(event: unknown): void {
        this.emit("message", { data: JSON.stringify(event) });
    }
}

function installFakeSocket(): void {
    FakeSocket.instances = [];
    (globalThis as Record<string, unknown>).WebSocket =
        FakeSocket as unknown as typeof WebSocket;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("realtimeUrl", () => {
    it("builds the wss v1 route with model and key", () => {
        const url = realtimeUrl({
            apiKey: "sk_test",
            model: "openai/gpt-live-transcribe",
        });
        expect(url).toBe(
            "wss://gen.pollinations.ai/v1/realtime?model=openai%2Fgpt-live-transcribe&key=sk_test",
        );
    });

    it("defaults to the voice model and omits the key when unset", () => {
        const url = realtimeUrl({ baseUrl: "http://localhost:8787/" });
        expect(url).toBe(
            "ws://localhost:8787/v1/realtime?model=openai%2Fgpt-realtime-2.1",
        );
    });

    it("trims every trailing slash from a caller-supplied base url", () => {
        expect(realtimeUrl({ baseUrl: "https://x.test////" })).toBe(
            "wss://x.test/v1/realtime?model=openai%2Fgpt-realtime-2.1",
        );
    });

    it("reads POLLINATIONS_API_KEY from the environment", () => {
        const global = globalThis as {
            process?: { env?: Record<string, string> };
        };
        const env = global.process?.env;
        if (!env) throw new Error("Expected process.env in the test runner");
        env.POLLINATIONS_API_KEY = "sk_from_env";
        try {
            expect(realtimeUrl()).toContain("key=sk_from_env");
        } finally {
            delete env.POLLINATIONS_API_KEY;
        }
    });
});

describe("connectRealtime", () => {
    it("resolves once the socket is open and targets the session url", async () => {
        installFakeSocket();
        const pending = connectRealtime({ apiKey: "sk_test" });
        const socket = FakeSocket.instances[0];
        expect(socket.url).toContain("/v1/realtime?model=");
        socket.open();
        const session = await pending;
        expect(session).toBeInstanceOf(RealtimeSession);
        expect(socket.closed).toBe(false);
    });

    it("rejects with a PollinationsError when the socket errors", async () => {
        installFakeSocket();
        const pending = connectRealtime({ apiKey: "sk_test" });
        FakeSocket.instances[0].emit("error", {});
        await expect(pending).rejects.toMatchObject({
            name: "PollinationsError",
            code: "REALTIME_CONNECTION",
        });
    });

    it("rejects when the socket closes before opening", async () => {
        installFakeSocket();
        const pending = connectRealtime({ apiKey: "sk_test" });
        FakeSocket.instances[0].close();
        await expect(pending).rejects.toThrow(/closed before it opened/);
    });
});

describe("RealtimeSession", () => {
    async function openSession() {
        installFakeSocket();
        const pending = connectRealtime({ apiKey: "sk_test" });
        const socket = FakeSocket.instances[0];
        socket.open();
        return { session: await pending, socket };
    }

    it("queues sends made before the socket opens", async () => {
        installFakeSocket();
        const socket = new FakeSocket("wss://example/v1/realtime");
        const session = new RealtimeSession(socket as unknown as WebSocket);
        session.send({ type: "response.cancel" });
        expect(socket.sent).toEqual([]);
        socket.open();
        expect(socket.sent).toEqual([
            JSON.stringify({ type: "response.cancel" }),
        ]);
    });

    it("sends immediately on a socket that is already open", async () => {
        const { session, socket } = await openSession();
        session.send({ type: "response.create" });
        expect(socket.sent).toEqual([
            JSON.stringify({ type: "response.create" }),
        ]);
    });

    it("dispatches events to the typed and catch-all handlers", async () => {
        const { session, socket } = await openSession();
        const deltas: string[] = [];
        const all: string[] = [];
        const offTyped = session.on(
            "response.audio_transcript.delta",
            (event) => deltas.push(event.delta ?? ""),
        );
        session.onEvent((event) => all.push(event.type));

        socket.message({
            type: "response.audio_transcript.delta",
            delta: "Hel",
        });
        socket.message({
            type: "response.done",
            response: { status: "completed" },
        });
        socket.message({
            type: "response.audio_transcript.delta",
            delta: "lo",
        });

        expect(deltas).toEqual(["Hel", "lo"]);
        expect(all).toEqual([
            "response.audio_transcript.delta",
            "response.done",
            "response.audio_transcript.delta",
        ]);

        offTyped();
        socket.message({ type: "response.audio_transcript.delta", delta: "!" });
        expect(deltas).toEqual(["Hel", "lo"]);
    });

    it("ignores frames that are not Realtime JSON events", async () => {
        const { session, socket } = await openSession();
        const seen: string[] = [];
        session.onEvent((event) => seen.push(event.type));
        socket.emit("message", { data: "not json" });
        socket.emit("message", { data: JSON.stringify({ no_type: true }) });
        socket.emit("message", { data: JSON.stringify(["array"]) });
        expect(seen).toEqual([]);
    });

    it("sends the documented client events", async () => {
        const { session, socket } = await openSession();
        session.sendText("hello");
        session.appendAudio("AAAA");
        session.commitAudio();
        session.updateSession({ voice: "coral" });
        expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
            {
                type: "conversation.item.create",
                item: {
                    type: "message",
                    role: "user",
                    content: [{ type: "input_text", text: "hello" }],
                },
            },
            { type: "response.create" },
            { type: "input_audio_buffer.append", audio: "AAAA" },
            { type: "input_audio_buffer.commit" },
            { type: "session.update", session: { voice: "coral" } },
        ]);
    });

    it("reports the close event to onClose handlers", async () => {
        const { session, socket } = await openSession();
        const codes: number[] = [];
        session.onClose((event) => codes.push(event.code));
        session.close();
        expect(socket.closed).toBe(true);
        expect(codes).toEqual([1000]);
    });
});
