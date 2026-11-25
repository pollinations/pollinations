import { afterEach, describe, expect, it } from "vitest";
import { Pollinations } from "./client.js";
import {
    base64ToPcm16,
    buildRealtimeUrl,
    connectRealtime,
    DEFAULT_REALTIME_MODEL,
    pcm16ToBase64,
    type WebSocketLike,
} from "./realtime.js";
import { PollinationsError } from "./types.js";

class MockWebSocket implements WebSocketLike {
    static instances: MockWebSocket[] = [];
    readonly url: string;
    readyState = 0; // CONNECTING
    sent: string[] = [];
    closedWith?: { code?: number; reason?: string };
    private listeners = new Map<string, Set<(event: unknown) => void>>();

    constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
    }

    addEventListener(
        type: "open" | "message" | "error" | "close",
        listener: (event: unknown) => void,
    ) {
        let set = this.listeners.get(type);
        if (!set) {
            set = new Set();
            this.listeners.set(type, set);
        }
        set.add(listener);
    }

    removeEventListener(
        type: "open" | "message" | "error" | "close",
        listener: (event: unknown) => void,
    ) {
        this.listeners.get(type)?.delete(listener);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close(code?: number, reason?: string) {
        this.closedWith = { code, reason };
        this.readyState = 3;
        this.dispatch("close", {
            code: code ?? 1000,
            reason: reason ?? "",
            wasClean: true,
        });
    }

    dispatch(type: string, event: unknown = {}) {
        if (type === "open") this.readyState = 1;
        if (type === "close") this.readyState = 3;
        for (const fn of this.listeners.get(type) ?? []) {
            fn(event);
        }
    }
}

describe("realtime helpers", () => {
    const originalEnvKey = process.env.POLLINATIONS_API_KEY;

    afterEach(() => {
        MockWebSocket.instances = [];
        if (originalEnvKey === undefined) {
            delete process.env.POLLINATIONS_API_KEY;
        } else {
            process.env.POLLINATIONS_API_KEY = originalEnvKey;
        }
    });

    it("builds wss://.../v1/realtime URL with model and key", () => {
        expect(
            buildRealtimeUrl(
                "https://gen.pollinations.ai",
                "openai/gpt-realtime-2.1",
                "sk_abc",
            ),
        ).toBe(
            "wss://gen.pollinations.ai/v1/realtime?model=openai%2Fgpt-realtime-2.1&key=sk_abc",
        );
    });

    it("refuses missing or non-secret keys", async () => {
        delete process.env.POLLINATIONS_API_KEY;
        await expect(
            connectRealtime({ WebSocket: MockWebSocket }),
        ).rejects.toThrow(PollinationsError);

        for (const badKey of ["pk_123", "sess_123", "ag_123"]) {
            await expect(
                connectRealtime({
                    apiKey: badKey,
                    WebSocket: MockWebSocket,
                }),
            ).rejects.toThrow(/secret key/i);
        }
    });

    it("falls back to POLLINATIONS_API_KEY and connects", async () => {
        process.env.POLLINATIONS_API_KEY = "sk_env_key";
        const promise = connectRealtime({ WebSocket: MockWebSocket });
        const ws = MockWebSocket.instances[0];
        expect(ws.url).toContain(`model=${encodeURIComponent(DEFAULT_REALTIME_MODEL)}`);
        expect(ws.url).toContain("key=sk_env_key");

        ws.dispatch("open");
        const session = await promise;
        expect(session.status).toBe("open");
        session.close();
        expect(session.status).toBe("closed");
    });

    it("passes OpenAI Realtime events through and sends client events", async () => {
        const promise = connectRealtime({
            apiKey: "sk_test",
            model: "openai/gpt-live-transcribe",
            WebSocket: MockWebSocket,
        });
        const ws = MockWebSocket.instances[0];
        ws.dispatch("open");
        const session = await promise;

        const specific: string[] = [];
        const all: string[] = [];
        const offSpecific = session.on("response.done", (ev) =>
            specific.push(ev.type),
        );
        session.on("*", (ev) => all.push(ev.type));

        session.updateSession({ voice: "alloy" });
        session.appendAudio(new Int16Array([100, -200, 300]));
        session.commitAudio();
        session.createResponse();

        expect(ws.sent.map((s) => JSON.parse(s).type)).toEqual([
            "session.update",
            "input_audio_buffer.append",
            "input_audio_buffer.commit",
            "response.create",
        ]);

        ws.dispatch("message", {
            data: JSON.stringify({ type: "session.created" }),
        });
        ws.dispatch("message", {
            data: JSON.stringify({ type: "response.done" }),
        });
        offSpecific();
        ws.dispatch("message", {
            data: JSON.stringify({ type: "response.done" }),
        });

        expect(specific).toEqual(["response.done"]);
        expect(all).toEqual(["session.created", "response.done", "response.done"]);
    });

    it("supports async iteration over server events until close", async () => {
        const promise = connectRealtime({
            apiKey: "sk_test",
            WebSocket: MockWebSocket,
        });
        const ws = MockWebSocket.instances[0];
        ws.dispatch("open");
        const session = await promise;

        const received: string[] = [];
        const iterTask = (async () => {
            for await (const ev of session) {
                received.push(ev.type);
            }
        })();

        ws.dispatch("message", { data: JSON.stringify({ type: "a" }) });
        ws.dispatch("message", { data: JSON.stringify({ type: "b" }) });
        session.close();
        await iterTask;

        expect(received).toEqual(["a", "b"]);
    });

    it("cancels connection when AbortSignal aborts before open", async () => {
        const controller = new AbortController();
        const promise = connectRealtime({
            apiKey: "sk_test",
            signal: controller.signal,
            WebSocket: MockWebSocket,
        });
        controller.abort();
        await expect(promise).rejects.toThrow(/cancelled/i);
    });

    it("round-trips PCM16 <-> base64", () => {
        const samples = new Int16Array([-32768, -1, 0, 1234, 32767]);
        const b64 = pcm16ToBase64(samples);
        const decoded = base64ToPcm16(b64);
        expect(Array.from(decoded)).toEqual(Array.from(samples));
    });

    it("connectRealtime works via Pollinations client instance", async () => {
        const client = new Pollinations({
            apiKey: "sk_client",
            baseUrl: "https://custom.example",
        });
        const promise = client.connectRealtime({ WebSocket: MockWebSocket });
        const ws = MockWebSocket.instances[0];
        expect(ws.url).toBe(
            "wss://custom.example/v1/realtime?model=openai%2Fgpt-realtime-2.1&key=sk_client",
        );
        ws.dispatch("open");
        const session = await promise;
        expect(session.status).toBe("open");
    });
});
