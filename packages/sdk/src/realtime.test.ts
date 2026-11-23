import { afterEach, describe, expect, it, vi } from "vitest";
import {
    base64ToPcm16,
    connectRealtime,
    DEFAULT_REALTIME_MODEL,
    pcm16ToBase64,
    realtimeUrl,
} from "./realtime.js";

type Handler = (event: unknown) => void;

class FakeSocket {
    static instances: FakeSocket[] = [];
    url: string;
    readyState = 0;
    sent: string[] = [];
    handlers = new Map<string, Set<Handler>>();
    closeCalls: Array<{ code?: number; reason?: string }> = [];

    constructor(url: string) {
        this.url = url;
        FakeSocket.instances.push(this);
    }

    addEventListener(type: string, handler: Handler) {
        const set = this.handlers.get(type) ?? new Set<Handler>();
        set.add(handler);
        this.handlers.set(type, set);
    }

    removeEventListener(type: string, handler: Handler) {
        this.handlers.get(type)?.delete(handler);
    }

    emit(type: string, event: unknown = {}) {
        for (const handler of [...(this.handlers.get(type) ?? [])])
            handler(event);
    }

    open() {
        this.readyState = 1;
        this.emit("open");
    }

    message(event: unknown) {
        this.emit("message", { data: JSON.stringify(event) });
    }

    fail(message = "boom") {
        this.emit("error", { message });
    }

    send(data: string) {
        if (this.readyState !== 1) throw new Error("socket not open");
        this.sent.push(data);
    }

    close(code?: number, reason?: string) {
        this.closeCalls.push({ code, reason });
        this.readyState = 3;
        this.emit("close", { code: code ?? 1000, reason: reason ?? "" });
    }
}

function lastSocket(): FakeSocket {
    const socket = FakeSocket.instances.at(-1);
    if (!socket) throw new Error("No socket created");
    return socket;
}

function sentEvents(
    socket: FakeSocket,
): Array<{ type: string; [key: string]: unknown }> {
    return socket.sent.map((raw) => JSON.parse(raw));
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeSocket.instances = [];
});

describe("realtimeUrl", () => {
    it("builds a /v1/realtime URL that preserves a base path prefix", () => {
        const url = new URL(
            realtimeUrl({
                baseUrl: "https://proxy.example/ai/",
                apiKey: "sk_test key",
                model: "openai/gpt-realtime-2.1",
            }),
        );
        expect(url.origin).toBe("https://proxy.example");
        expect(url.pathname).toBe("/ai/v1/realtime");
        expect(url.searchParams.get("model")).toBe(DEFAULT_REALTIME_MODEL);
        expect(url.searchParams.get("key")).toBe("sk_test key");
    });

    it("defaults to the public gateway and realtime voice model", () => {
        const url = new URL(realtimeUrl({ apiKey: "sk_test" }));
        expect(url.origin).toBe("https://gen.pollinations.ai");
        expect(url.pathname).toBe("/v1/realtime");
        expect(url.searchParams.get("model")).toBe("openai/gpt-realtime-2.1");
    });
});

describe("connectRealtime configuration", () => {
    it("rejects a missing API key", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        vi.stubEnv("POLLINATIONS_API_KEY", "");
        await expect(connectRealtime({})).rejects.toThrow(/API key/);
        expect(FakeSocket.instances).toHaveLength(0);
    });

    it("rejects key types a browser WebSocket cannot authenticate with", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        await expect(connectRealtime({ apiKey: "pk_public" })).rejects.toThrow(
            /secret key/,
        );
        await expect(connectRealtime({ apiKey: "sess_token" })).rejects.toThrow(
            /secret key/,
        );
        expect(FakeSocket.instances).toHaveLength(0);
    });

    it("falls back to POLLINATIONS_API_KEY when no key is passed", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        vi.stubEnv("POLLINATIONS_API_KEY", "sk_from_env");
        const connecting = connectRealtime({});
        expect(lastSocket().url).toContain("key=sk_from_env");
        lastSocket().open();
        await connecting;
    });
});

describe("connectRealtime lifecycle", () => {
    it("resolves on open, sends session.update first, then events in order", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const connecting = connectRealtime({
            apiKey: "sk_test",
            session: { type: "realtime", instructions: "Be brief." },
        });
        const socket = lastSocket();

        socket.open();
        const session = await connecting;
        expect(session).toBeDefined();

        session.send({ type: "input_audio_buffer.append", audio: "AAAA" });
        session.send({ type: "response.create" });
        expect(sentEvents(socket).map((event) => event.type)).toEqual([
            "session.update",
            "input_audio_buffer.append",
            "response.create",
        ]);
    });

    it("delivers events to type listeners, wildcard listeners and onEvent", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const onEvent = vi.fn();
        const connecting = connectRealtime({ apiKey: "sk_test", onEvent });
        const socket = lastSocket();
        socket.open();
        const session = await connecting;

        const typed: unknown[] = [];
        const wildcard: unknown[] = [];
        const offTyped = session.on("response.audio.delta", (event) => {
            typed.push(event);
        });
        const offWildcard = session.on("*", (event) => {
            wildcard.push(event);
        });

        socket.message({ type: "response.audio.delta", delta: "AAAA" });
        expect(typed).toHaveLength(1);
        expect(wildcard).toHaveLength(1);
        expect(onEvent).toHaveBeenCalledTimes(1);

        offTyped();
        offWildcard();
        socket.message({ type: "response.audio.delta", delta: "AAAA" });
        expect(typed).toHaveLength(1);
        expect(wildcard).toHaveLength(1);
        expect(onEvent).toHaveBeenCalledTimes(2);
    });

    it("delivers an event received before the connection resolves to onEvent", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const onEvent = vi.fn();
        const connecting = connectRealtime({ apiKey: "sk_test", onEvent });
        const socket = lastSocket();
        socket.message({ type: "session.created" });
        socket.open();
        await connecting;
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({ type: "session.created" }),
        );
    });

    it("keeps notifying listeners when one listener throws", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const connecting = connectRealtime({ apiKey: "sk_test" });
        const socket = lastSocket();
        socket.open();
        const session = await connecting;
        const second = vi.fn();
        session.on("*", () => {
            throw new Error("bad listener");
        });
        session.on("*", second);

        socket.message({ type: "response.done" });
        expect(second).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalled();
    });

    it("rejects when the socket errors before opening", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const connecting = connectRealtime({ apiKey: "sk_test" });
        lastSocket().fail("handshake failed");
        await expect(connecting).rejects.toThrow(/handshake failed/);
    });

    it("emits an error event when the socket errors after opening", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const connecting = connectRealtime({ apiKey: "sk_test" });
        const socket = lastSocket();
        socket.open();
        const session = await connecting;
        const errors: unknown[] = [];
        session.on("error", (event) => errors.push(event));

        socket.fail("late failure");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({
            type: "error",
            error: "late failure",
        });
    });

    it("rejects when the socket closes before opening", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const connecting = connectRealtime({ apiKey: "sk_test" });
        lastSocket().close(1006, "gone");
        await expect(connecting).rejects.toThrow(/gone/);
    });

    it("resolves closed() with the close code and reason", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const connecting = connectRealtime({ apiKey: "sk_test" });
        const socket = lastSocket();
        socket.open();
        const session = await connecting;

        socket.close(1000, "done");
        await expect(session.closed).resolves.toEqual({
            code: 1000,
            reason: "done",
        });
    });

    it("rejects with the abort reason and closes the socket when aborted before open", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const controller = new AbortController();
        const reason = new Error("user cancelled");
        controller.abort(reason);
        const connecting = connectRealtime({
            apiKey: "sk_test",
            signal: controller.signal,
        });
        await expect(connecting).rejects.toBe(reason);
        expect(lastSocket().closeCalls).toHaveLength(1);
    });

    it("closes an open socket when its signal aborts", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const controller = new AbortController();
        const connecting = connectRealtime({
            apiKey: "sk_test",
            signal: controller.signal,
        });
        const socket = lastSocket();
        socket.open();
        await connecting;

        controller.abort();
        expect(socket.closeCalls).toHaveLength(1);
    });

    it("times out a connection that never opens", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocket", FakeSocket);
        const connecting = connectRealtime({
            apiKey: "sk_test",
            timeout: 1000,
        });
        const socket = lastSocket();
        const assertion = expect(connecting).rejects.toThrow(/timed out/);
        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
        expect(socket.closeCalls).toHaveLength(1);
    });

    it("refuses to send after close", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const connecting = connectRealtime({ apiKey: "sk_test" });
        const socket = lastSocket();
        socket.open();
        const session = await connecting;
        session.close();
        expect(() => session.send({ type: "response.create" })).toThrow(
            /closed/,
        );
    });
});

describe("PCM16 conversion", () => {
    it("round-trips signed 16-bit samples through base64 without loss", () => {
        const pcm = new Int16Array([0, 1, -1, 32767, -32768, 1234, -5678]);
        const encoded = pcm16ToBase64(pcm);
        expect(typeof encoded).toBe("string");
        expect(Array.from(base64ToPcm16(encoded))).toEqual(Array.from(pcm));
    });

    it("keeps chunk boundaries in order", () => {
        const first = new Int16Array([1, 2, 3]);
        const second = new Int16Array([4, 5, 6]);
        expect(
            Array.from(
                base64ToPcm16(pcm16ToBase64(first) + pcm16ToBase64(second)),
            ),
        ).toEqual([1, 2, 3, 4, 5, 6]);
    });
});
