import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    base64ToPcm16,
    connectRealtime,
    pcm16ToBase64,
    realtimeUrl,
} from "./realtime.js";
import { PollinationsError } from "./types.js";

/** The parts of a browser WebSocket the helper uses, driven by the test. */
class FakeSocket extends EventTarget {
    static last: FakeSocket;
    readyState = 0;
    sent: unknown[] = [];
    constructor(public url: string) {
        super();
        FakeSocket.last = this;
    }
    send(data: string) {
        this.sent.push(JSON.parse(data));
    }
    open() {
        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
    }
    receive(event: unknown) {
        this.dispatchEvent(
            new MessageEvent("message", { data: JSON.stringify(event) }),
        );
    }
    close(code = 1005, reason = "") {
        this.readyState = 3;
        this.dispatchEvent(Object.assign(new Event("close"), { code, reason }));
    }
}

beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeSocket);
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("realtimeUrl", () => {
    it("puts the model and key in the query on the wss route", () => {
        const url = new URL(realtimeUrl({ apiKey: "sk_test" }));
        expect(url.origin + url.pathname).toBe(
            "wss://gen.pollinations.ai/v1/realtime",
        );
        expect(url.searchParams.get("model")).toBe("openai/gpt-realtime-2.1");
        expect(url.searchParams.get("key")).toBe("sk_test");
        expect(
            realtimeUrl({ apiKey: "sk_x", baseUrl: "http://localhost:8788" }),
        ).toBe(
            "ws://localhost:8788/v1/realtime?model=openai%2Fgpt-realtime-2.1&key=sk_x",
        );
    });

    it("refuses tokens the gateway does not accept in a query", async () => {
        expect(() => realtimeUrl({ apiKey: "sess_abc" })).toThrow(/sk_/);
        // connectRealtime reports it as a rejection, not a synchronous throw
        const pending = connectRealtime({ apiKey: "ag_abc" });
        await expect(pending).rejects.toThrow(/sk_/);
    });
});

describe("connectRealtime", () => {
    it("sends session.update first, then passes events both ways", async () => {
        const pending = connectRealtime({
            apiKey: "sk_test",
            model: "openai/gpt-realtime-2.1-mini",
            session: { type: "realtime", instructions: "Be brief." },
        });
        const socket = FakeSocket.last;
        expect(new URL(socket.url).searchParams.get("model")).toBe(
            "openai/gpt-realtime-2.1-mini",
        );
        socket.open();
        const session = await pending;
        expect(socket.sent).toEqual([
            {
                type: "session.update",
                session: { type: "realtime", instructions: "Be brief." },
            },
        ]);

        const deltas: unknown[] = [];
        const all: string[] = [];
        const off = session.on("response.output_text.delta", (e) =>
            deltas.push(e.delta),
        );
        session.on("*", (e) => all.push(e.type));
        socket.receive({ type: "response.output_text.delta", delta: "Hi" });
        off();
        socket.receive({ type: "response.output_text.delta", delta: "!" });
        expect(deltas).toEqual(["Hi"]);
        expect(all).toEqual([
            "response.output_text.delta",
            "response.output_text.delta",
        ]);

        session.send({ type: "response.create" });
        expect(socket.sent.at(-1)).toEqual({ type: "response.create" });

        socket.close(1008, "Insufficient balance");
        await expect(session.closed).resolves.toEqual({
            code: 1008,
            reason: "Insufficient balance",
        });
    });

    it("rejects when the socket closes before opening", async () => {
        const pending = connectRealtime({ apiKey: "sk_test" });
        FakeSocket.last.close(1006);
        const error = await pending.catch((e) => e);
        expect(error).toBeInstanceOf(PollinationsError);
        expect(error.message).toMatch(/before opening/);
        expect(error.details).toEqual({ closeCode: 1006 });
    });

    it("closes on abort, while connecting and after opening", async () => {
        const early = new AbortController();
        const pending = connectRealtime({
            apiKey: "sk_test",
            signal: early.signal,
        });
        const first = FakeSocket.last;
        early.abort();
        await expect(pending).rejects.toBe(early.signal.reason);
        expect(first.readyState).toBe(3);

        const late = new AbortController();
        const opening = connectRealtime({
            apiKey: "sk_test",
            signal: late.signal,
        });
        FakeSocket.last.open();
        const session = await opening;
        late.abort();
        await tick();
        await expect(session.closed).resolves.toMatchObject({ code: 1000 });
    });
});

describe("PCM16 helpers", () => {
    it("round-trips samples and clamps out-of-range values", () => {
        const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2]);
        const back = base64ToPcm16(pcm16ToBase64(samples));
        expect(back.length).toBe(6);
        expect(back[1]).toBeCloseTo(0.5, 3);
        expect(back[2]).toBeCloseTo(-0.5, 3);
        expect(back[4]).toBe(-1);
        expect(back[5]).toBeCloseTo(1, 3);
        // 0.5 as little-endian int16 is 0x3fff: bytes ff 3f
        expect(pcm16ToBase64(new Float32Array([0.5]))).toBe("/z8=");
    });
});
