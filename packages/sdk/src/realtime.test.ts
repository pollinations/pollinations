import { afterEach, describe, expect, it, vi } from "vitest";
import { connectRealtime, realtimeUrl } from "./realtime.js";

/** The parts of a WebSocket the helper uses, driven by the test. */
class FakeSocket extends EventTarget {
    static last: FakeSocket | null = null;
    readyState = 0;
    sent: string[] = [];
    constructor(public url: string) {
        super();
        FakeSocket.last = this;
    }
    send(data: string) {
        this.sent.push(data);
    }
    close(code = 1000, reason = "") {
        this.readyState = 3;
        this.dispatchEvent(Object.assign(new Event("close"), { code, reason }));
    }
    open() {
        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
    }
    receive(event: unknown) {
        this.dispatchEvent(
            Object.assign(new Event("message"), {
                data: JSON.stringify(event),
            }),
        );
    }
}

function socket(): FakeSocket {
    if (!FakeSocket.last) throw new Error("No socket was opened");
    return FakeSocket.last;
}

afterEach(() => {
    vi.unstubAllGlobals();
    FakeSocket.last = null;
});

describe("realtimeUrl", () => {
    it("puts the model and the key in the query string", () => {
        const url = new URL(
            realtimeUrl({
                apiKey: "sk_test",
                model: "openai/gpt-realtime-2.1",
            }),
        );
        expect(url.protocol).toBe("wss:");
        expect(url.host).toBe("gen.pollinations.ai");
        expect(url.pathname).toBe("/v1/realtime");
        expect(url.searchParams.get("model")).toBe("openai/gpt-realtime-2.1");
        expect(url.searchParams.get("key")).toBe("sk_test");
    });

    it("keeps the path of a custom base URL", () => {
        const url = new URL(
            realtimeUrl({
                apiKey: "sk_test",
                baseUrl: "http://localhost:8788",
            }),
        );
        expect(url.protocol).toBe("ws:");
        expect(url.pathname).toBe("/v1/realtime");
    });

    it("refuses keys the gateway cannot authenticate in a query string", () => {
        expect(() => realtimeUrl({ apiKey: "pk_app" })).toThrow(/sk_/);
        expect(() => realtimeUrl({ apiKey: "sess_token" })).toThrow(/sk_/);
    });

    it("falls back to the key in the environment", () => {
        process.env.POLLINATIONS_API_KEY = "sk_env";
        try {
            expect(new URL(realtimeUrl({})).searchParams.get("key")).toBe(
                "sk_env",
            );
        } finally {
            delete process.env.POLLINATIONS_API_KEY;
        }
    });
});

describe("connectRealtime", () => {
    it("sends the session config as the first event", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const connected = connectRealtime({
            apiKey: "sk_test",
            session: { type: "realtime", instructions: "Be concise." },
        });
        socket().open();
        const session = await connected;

        expect(socket().sent).toEqual([
            JSON.stringify({
                type: "session.update",
                session: { type: "realtime", instructions: "Be concise." },
            }),
        ]);
        session.close();
    });

    it("passes server events to the listeners of their type and to all", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const connected = connectRealtime({ apiKey: "sk_test" });
        socket().open();
        const session = await connected;

        const typed: unknown[] = [];
        const all: unknown[] = [];
        session.on("response.done", (event) => typed.push(event));
        session.on("*", (event) => all.push(event));
        socket().receive({ type: "response.done", response: { id: "r1" } });
        socket().receive({ type: "error", error: { message: "no" } });

        expect(typed).toEqual([
            { type: "response.done", response: { id: "r1" } },
        ]);
        expect(all).toHaveLength(2);

        const off = session.on("response.done", () => {
            throw new Error("The listener should be removed");
        });
        off();
        session.close();
    });

    it("rejects when the socket closes before opening", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const connected = connectRealtime({ apiKey: "sk_test" });
        socket().close(1006, "");
        await expect(connected).rejects.toThrow(/closed before opening/);
    });

    it("closes the socket when the signal is aborted", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const controller = new AbortController();
        const connected = connectRealtime({
            apiKey: "sk_test",
            signal: controller.signal,
        });
        socket().open();
        const session = await connected;
        controller.abort();
        await expect(session.closed).resolves.toEqual({
            code: 1000,
            reason: "",
        });
    });

    it("refuses to send on a closed session", async () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const connected = connectRealtime({ apiKey: "sk_test" });
        socket().open();
        const session = await connected;
        session.close();
        expect(() => session.send({ type: "response.create" })).toThrow(
            /not open/,
        );
    });
});
