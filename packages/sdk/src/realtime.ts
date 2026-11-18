/**
 * Realtime voice and transcription sessions over the OpenAI-compatible
 * Realtime WebSocket.
 *
 * @example
 * ```ts
 * const session = await connectRealtime({
 *     apiKey,
 *     session: { type: "realtime", instructions: "Be concise." },
 * });
 * session.on("response.output_audio_transcript.delta", (event) => {
 *     console.log(event.delta);
 * });
 * session.send({ type: "response.create" });
 * ```
 */

import { DEFAULT_BASE_URL, getEnvVar } from "./client.js";
import { PollinationsError } from "./types.js";

/** The realtime model the gateway uses when none is given. */
export const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1";

/** An OpenAI Realtime protocol event. */
export interface RealtimeEvent {
    type: string;
    [key: string]: unknown;
}

export interface RealtimeOptions {
    /**
     * Secret key (`sk_`). The key travels in the query string, because a
     * browser cannot set headers on a WebSocket handshake. Defaults to
     * `POLLINATIONS_API_KEY` from the environment.
     */
    apiKey?: string;
    /** Realtime model. Defaults to "openai/gpt-realtime-2.1". */
    model?: string;
    /** API base URL. Defaults to https://gen.pollinations.ai. */
    baseUrl?: string;
    /** Session config, sent as the first `session.update` event. */
    session?: Record<string, unknown>;
    /** Aborting closes the session. */
    signal?: AbortSignal;
}

export interface RealtimeSession {
    /** Sends one client event. */
    send(event: RealtimeEvent): void;
    /**
     * Listens to one event type, or "*" for every event. Returns a function
     * that removes the listener.
     */
    on(type: string, listener: (event: RealtimeEvent) => void): () => void;
    /** Closes the socket. */
    close(): void;
    /** Resolves when the socket closes, with the close code and reason. */
    readonly closed: Promise<{ code: number; reason: string }>;
}

/** WebSocket readyState values, so any implementation works. */
const CONNECTING = 0;
const OPEN = 1;
/** The session URL, with the key in the query string for browser clients. */
export function realtimeUrl(options: RealtimeOptions): string {
    const apiKey = options.apiKey ?? getEnvVar("POLLINATIONS_API_KEY");
    if (!apiKey) {
        throw new PollinationsError(
            "API key is required. Get one for free at https://enter.pollinations.ai/keys",
            "API_KEY",
            401,
        );
    }
    // The gateway authenticates secret keys in a query string, but not App
    // Keys (not credentials) or session and agent-run tokens (revocable).
    if (/^(pk_|sess_|ag_)/.test(apiKey)) {
        throw new PollinationsError(
            "A realtime session needs a secret key (sk_), not an app key or a session token",
            "API_KEY",
            401,
        );
    }
    const url = new URL("/v1/realtime", options.baseUrl ?? DEFAULT_BASE_URL);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.searchParams.set("model", options.model ?? DEFAULT_REALTIME_MODEL);
    url.searchParams.set("key", apiKey);
    return url.toString();
}

/**
 * Opens a realtime session and resolves once the socket is open and the
 * session config has been sent.
 */
export async function connectRealtime(
    options: RealtimeOptions,
): Promise<RealtimeSession> {
    options.signal?.throwIfAborted();
    if (typeof WebSocket === "undefined") {
        throw new PollinationsError(
            "A realtime session needs a WebSocket implementation (a browser, Node 22+, Bun or Deno)",
            "REALTIME_UNSUPPORTED",
            0,
        );
    }

    const socket = new WebSocket(realtimeUrl(options));
    const listeners = new Map<string, Set<(event: RealtimeEvent) => void>>();

    const emit = (type: string, event: RealtimeEvent) => {
        for (const listener of listeners.get(type) ?? []) listener(event);
    };

    const close = () => {
        if (socket.readyState === CONNECTING || socket.readyState === OPEN) {
            socket.close(1000);
        }
    };

    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
        socket.addEventListener("close", (event) => {
            options.signal?.removeEventListener("abort", close);
            resolve({ code: event.code, reason: event.reason });
        });
    });

    socket.addEventListener("message", (message) => {
        if (typeof message.data !== "string") return; // JSON text frames only
        let event: RealtimeEvent;
        try {
            event = JSON.parse(message.data) as RealtimeEvent;
        } catch {
            return;
        }
        emit(event.type, event);
        emit("*", event);
    });

    options.signal?.addEventListener("abort", close, { once: true });

    const session: RealtimeSession = {
        send(event) {
            if (socket.readyState !== OPEN) {
                throw new Error("The realtime session is not open.");
            }
            socket.send(JSON.stringify(event));
        },
        on(type, listener) {
            const set = listeners.get(type) ?? new Set();
            set.add(listener);
            listeners.set(type, set);
            return () => {
                set.delete(listener);
            };
        },
        close,
        closed,
    };

    return new Promise<RealtimeSession>((resolve, reject) => {
        socket.addEventListener("open", () => {
            if (options.session) {
                session.send({
                    type: "session.update",
                    session: options.session,
                });
            }
            resolve(session);
        });
        void closed.then(({ code, reason }) => {
            // A refused upgrade never opens: the key, the balance or the model
            // is wrong, and the browser hides the HTTP response.
            reject(
                new PollinationsError(
                    reason ||
                        "The realtime session closed before opening. Check the key, its balance and the model.",
                    "REALTIME_CONNECT_FAILED",
                    0,
                    { closeCode: code },
                ),
            );
        });
    });
}

/** Float samples in [-1, 1] as base64 PCM16, for `input_audio_buffer.append`. */
export function pcm16ToBase64(samples: Float32Array): string {
    const bytes = new Uint8Array(samples.length * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < samples.length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(
            i * 2,
            sample < 0 ? sample * 0x8000 : sample * 0x7fff,
            true,
        );
    }
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

/** Base64 PCM16 as float samples in [-1, 1], for playing the model's audio. */
export function base64ToPcm16(base64: string): Float32Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const view = new DataView(bytes.buffer);
    const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
    for (let i = 0; i < samples.length; i++) {
        samples[i] = view.getInt16(i * 2, true) / 0x8000;
    }
    return samples;
}
