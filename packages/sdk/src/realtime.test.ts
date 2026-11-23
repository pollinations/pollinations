import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    decodeAudioChunk,
    encodeAudioChunk,
    openRealtimeSession,
    type RealtimeEvent,
    realtimeUrl,
} from "./realtime.js";

type Listener = (event: unknown) => void;

/** Minimal WebSocket the SDK drives the way a browser does. */
class FakeSocket {
    static instances: FakeSocket[] = [];
    static readonly OPEN = 1;

    readonly url: string;
    readyState = 0;
    sent: string[] = [];
    private listeners = new Map<string, Listener[]>();

    constructor(url: string) {
        this.url = url;
        FakeSocket.instances.push(this);
    }

    addEventListener(type: string, listener: Listener): void {
        this.listeners.set(type, [
            ...(this.listeners.get(type) ?? []),
            listener,
        ]);
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        this.readyState = 3;
        this.emit("close", { reason: "" });
    }

    // Test drivers -----------------------------------------------------------

    open(): void {
        this.readyState = 1;
        this.emit("open", {});
    }

    receive(event: RealtimeEvent): void {
        this.emit("message", { data: JSON.stringify(event) });
    }

    fail(): void {
        this.emit("close", { reason: "unauthorized" });
    }

    private emit(type: string, event: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
}

function lastSocket(): FakeSocket {
    return FakeSocket.instances[FakeSocket.instances.length - 1];
}

/** Connect a session and return it with the socket the SDK created. */
async function connected(
    options: Parameters<typeof openRealtimeSession>[0] = {},
) {
    const pending = openRealtimeSession({ apiKey: "sk_test", ...options });
    const socket = lastSocket();
    socket.open();
    return { session: await pending, socket };
}

beforeEach(() => {
    FakeSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("realtimeUrl", () => {
    it("targets the Realtime route with the model and the browser key", () => {
        expect(
            realtimeUrl({ apiKey: "sk_test", model: "google/gemini-3.8-live" }),
        ).toBe(
            "wss://gen.pollinations.ai/v1/realtime?model=google%2Fgemini-3.8-live&key=sk_test",
        );
    });

    it("maps an http base URL to ws for local development", () => {
        expect(
            realtimeUrl({
                apiKey: "sk_test",
                baseUrl: "http://localhost:8788/",
            }),
        ).toMatch(/^ws:\/\/localhost:8788\/v1\/realtime\?/);
    });

    it("requires a key", () => {
        expect(() => realtimeUrl({ apiKey: "" })).toThrow(
            /API key is required/,
        );
    });
});

describe("openRealtimeSession", () => {
    it("configures the session as soon as the socket opens", async () => {
        const { socket } = await connected({
            instructions: "Be concise.",
            tools: [{ type: "function", name: "lookup" }],
        });

        expect(JSON.parse(socket.sent[0])).toEqual({
            type: "session.update",
            session: {
                // No `type`: the route already created the right session, and a
                // transcription deployment rejects a realtime one.
                audio: {
                    input: {
                        format: { type: "audio/pcm", rate: 24000 },
                        // Manual turns, without the provider answering alone.
                        turn_detection: null,
                    },
                },
                instructions: "Be concise.",
                tools: [{ type: "function", name: "lookup" }],
            },
        });
    });

    it("keeps the audio format when a caller adds transcription fields", async () => {
        const { socket } = await connected({
            model: "microsoft/mai-transcribe-2-streaming",
            session: {
                type: "transcription",
                audio: { input: { transcription: { languages: ["en"] } } },
            },
        });

        const { session } = JSON.parse(socket.sent[0]);
        expect(session.type).toBe("transcription");
        expect(session.audio.input).toEqual({
            format: { type: "audio/pcm", rate: 24000 },
            turn_detection: null,
            transcription: { languages: ["en"] },
        });
    });

    it("stops sending once the socket has closed", async () => {
        const { session, socket } = await connected();
        socket.close();

        session.send({ type: "response.create" });

        // Only the opening session.update reached the socket.
        expect(socket.sent).toHaveLength(1);
    });

    it("reports the server closing the session", async () => {
        const { session, socket } = await connected();
        const reasons: string[] = [];
        session.onClose((event) => reasons.push(event.reason));

        socket.fail();

        expect(reasons).toEqual(["unauthorized"]);
    });

    it("dispatches server events until the handler unsubscribes", async () => {
        const { session, socket } = await connected();
        const seen: string[] = [];
        const unsubscribe = session.onEvent((event) => seen.push(event.type));

        socket.receive({ type: "session.created" });
        unsubscribe();
        socket.receive({ type: "response.done" });

        expect(seen).toEqual(["session.created"]);
    });

    it("reports the events it sends, so audio playback can stop early", async () => {
        const { session } = await connected();
        const seen: string[] = [];
        session.onSent((event) => seen.push(event.type));

        session.send({ type: "response.cancel" });

        expect(seen).toEqual(["response.cancel"]);
    });

    it("fails when the handshake is rejected", async () => {
        const pending = openRealtimeSession({ apiKey: "sk_test" });
        lastSocket().fail();

        await expect(pending).rejects.toThrow(/Realtime connection failed/);
    });
});

describe("audio chunks", () => {
    it("round-trips PCM16 samples", () => {
        const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);

        const decoded = decodeAudioChunk(encodeAudioChunk(samples));

        expect(decoded.length).toBe(samples.length);
        for (let i = 0; i < samples.length; i++) {
            expect(decoded[i]).toBeCloseTo(samples[i], 3);
        }
    });
});
