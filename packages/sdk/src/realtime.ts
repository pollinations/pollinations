/**
 * Realtime voice and live transcription sessions over
 * `wss://gen.pollinations.ai/v1/realtime`. Events are the OpenAI Realtime
 * protocol, passed through as plain objects in both directions.
 */

import { PollinationsError } from "./types.js";

const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1";

/** One OpenAI Realtime event, sent or received. */
export interface RealtimeEvent {
    type: string;
    [key: string]: unknown;
}

export interface RealtimeOptions {
    /** The user's secret key (`sk_`). It is sent as `?key=`. */
    apiKey: string;
    /** Defaults to `openai/gpt-realtime-2.1`. A transcription model such as `openai/gpt-live-transcribe` opens a transcription session. */
    model?: string;
    baseUrl?: string;
    /** Sent as `session.update` before any other event. */
    session?: Record<string, unknown>;
    /** Aborting closes the session, or cancels it while connecting. */
    signal?: AbortSignal;
}

export interface RealtimeSession {
    /** Sends one event as JSON. */
    send(event: RealtimeEvent): void;
    /** Listens to one event type, or `"*"` for all. Returns an unsubscribe function. */
    on(type: string, listener: (event: RealtimeEvent) => void): () => void;
    close(): void;
    /** Resolves when the socket closes, with the server's close code and reason. */
    closed: Promise<{ code: number; reason: string }>;
    socket: WebSocket;
}

/** Session URL with the key in `?key=`, since browsers cannot set WebSocket headers. */
export function realtimeUrl(
    options: Pick<RealtimeOptions, "apiKey" | "model" | "baseUrl">,
): string {
    const { apiKey } = options;
    if (!apiKey) {
        throw new Error("A Pollinations secret key (sk_) is required");
    }
    // The gateway refuses session and agent-run tokens in a query string.
    if (apiKey.startsWith("sess_") || apiKey.startsWith("ag_")) {
        throw new Error(
            "Realtime needs a secret key (sk_), not a session token",
        );
    }
    const url = new URL(
        "/v1/realtime",
        options.baseUrl ?? "https://gen.pollinations.ai",
    );
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.searchParams.set("model", options.model ?? DEFAULT_REALTIME_MODEL);
    url.searchParams.set("key", apiKey);
    return url.toString();
}

/** Opens a session and resolves once the socket is open and `session` has been sent. */
export async function connectRealtime(
    options: RealtimeOptions,
): Promise<RealtimeSession> {
    const { signal } = options;
    signal?.throwIfAborted();
    // Browsers and Node 22+ have a global WebSocket.
    const socket = new WebSocket(realtimeUrl(options));
    const listeners = new Map<string, Set<(event: RealtimeEvent) => void>>();
    const emit = (type: string, event: RealtimeEvent) => {
        for (const listener of listeners.get(type) ?? []) listener(event);
    };
    const close = () => {
        if (socket.readyState < 2) socket.close(1000);
    };
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
        socket.addEventListener("close", (event) => {
            signal?.removeEventListener("abort", close);
            resolve({ code: event.code, reason: event.reason });
        });
    });
    socket.addEventListener("message", (message) => {
        let event: RealtimeEvent;
        try {
            event = JSON.parse(message.data);
        } catch {
            return; // the gateway sends JSON text frames only
        }
        emit(event.type, event);
        emit("*", event);
    });
    signal?.addEventListener("abort", close, { once: true });

    const session: RealtimeSession = {
        send: (event) => socket.send(JSON.stringify(event)),
        on(type, listener) {
            const set = listeners.get(type) ?? new Set();
            listeners.set(type, set.add(listener));
            return () => set.delete(listener);
        },
        close,
        closed,
        socket,
    };

    return new Promise((resolve, reject) => {
        socket.addEventListener("open", () => {
            if (options.session) {
                session.send({
                    type: "session.update",
                    session: options.session,
                });
            }
            resolve(session);
        });
        // Key, balance, model and rate-limit errors are HTTP responses to the
        // upgrade, which browsers hide: the socket just closes before opening.
        closed.then(({ code, reason }) => {
            if (signal?.aborted) {
                reject(signal.reason);
                return;
            }
            reject(
                new PollinationsError(
                    reason ||
                        "Realtime session closed before opening. Check the key, its balance and the model.",
                    "REALTIME_CONNECT_FAILED",
                    0,
                    { closeCode: code },
                ),
            );
        });
    });
}

/** Float samples in [-1, 1] to base64 PCM16 (little-endian), for `input_audio_buffer.append`. */
export function pcm16ToBase64(samples: Float32Array): string {
    const bytes = new Uint8Array(samples.length * 2);
    const view = new DataView(bytes.buffer);
    samples.forEach((sample, i) => {
        const s = Math.max(-1, Math.min(1, sample));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    });
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/** Base64 PCM16 from `response.output_audio.delta` to float samples for playback. */
export function base64ToPcm16(base64: string): Float32Array {
    const binary = atob(base64);
    const view = new DataView(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++)
        view.setUint8(i, binary.charCodeAt(i));
    const samples = new Float32Array(binary.length >> 1);
    for (let i = 0; i < samples.length; i++) {
        samples[i] = view.getInt16(i * 2, true) / 0x8000;
    }
    return samples;
}
