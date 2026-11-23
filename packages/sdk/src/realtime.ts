/**
 * OpenAI Realtime over Pollinations' WebSocket gateway.
 *
 * Browser WebSockets cannot set an Authorization header, so a secret key is
 * passed in the `key` query parameter (see https://gen.pollinations.ai/docs).
 */
import { DEFAULT_BASE_URL, getEnvVar } from "./client.js";

export const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1";
const DEFAULT_TIMEOUT_MS = 15_000;
const WS_OPEN = 1;
const WS_CLOSED = 3;

export interface RealtimeEvent {
    type: string;
    [key: string]: unknown;
}

export type RealtimeListener = (event: RealtimeEvent) => void;

export interface RealtimeOptions {
    /** Secret (`sk_`) key. Defaults to POLLINATIONS_API_KEY in Node. */
    apiKey?: string;
    model?: string;
    /** Gateway URL. A path prefix is preserved, e.g. https://proxy/ai. */
    baseUrl?: string;
    /** Sent as session.update as soon as the socket opens. */
    session?: Record<string, unknown>;
    /** Aborting closes the socket and rejects with signal.reason. */
    signal?: AbortSignal;
    /** Handshake timeout in ms. Default 15000. */
    timeout?: number;
    /** Registered before the handshake, so no early event is missed. */
    onEvent?: RealtimeListener;
}

export interface RealtimeSession {
    /** Send an OpenAI Realtime client event. */
    send(event: RealtimeEvent): void;
    /** Subscribe to an event type, or "*" for every event. Returns unsubscribe. */
    on(type: string, listener: RealtimeListener): () => void;
    /** Close the session. Safe to call more than once. */
    close(): void;
    /** Resolves with the close code and reason when the socket closes. */
    readonly closed: Promise<{ code: number; reason: string }>;
}

function resolveApiKey(apiKey?: string): string {
    const key = apiKey ?? getEnvVar("POLLINATIONS_API_KEY");
    if (!key) {
        throw new Error(
            "API key is required for realtime sessions. Get a secret key at https://enter.pollinations.ai/keys",
        );
    }
    // pk_, sess_ and ag_ keys cannot authenticate a browser WebSocket.
    if (/^(pk_|sess_|ag_)/.test(key)) {
        throw new Error(
            "A secret key (sk_...) is required for realtime sessions; public and token keys are not accepted",
        );
    }
    return key;
}

/** Build the wss:// URL for a realtime session. */
export function realtimeUrl(options: RealtimeOptions = {}): string {
    const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const url = new URL(`${base}/v1/realtime`);
    url.searchParams.set("model", options.model ?? DEFAULT_REALTIME_MODEL);
    url.searchParams.set("key", resolveApiKey(options.apiKey));
    return url.toString();
}

/** Encode little-endian mono PCM16 samples as base64 for input_audio_buffer.append. */
export function pcm16ToBase64(samples: Int16Array): string {
    const view = new DataView(new ArrayBuffer(samples.length * 2));
    for (let index = 0; index < samples.length; index++) {
        view.setInt16(index * 2, samples[index] ?? 0, true);
    }
    const bytes = new Uint8Array(view.buffer);
    let binary = "";
    // Chunked so large buffers do not overflow String.fromCharCode's argument list.
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 0x8000),
        );
    }
    return btoa(binary);
}

/** Decode a base64 response.audio.delta into little-endian mono PCM16 samples. */
export function base64ToPcm16(base64: string): Int16Array {
    const binary = atob(base64);
    const samples = new Int16Array(Math.floor(binary.length / 2));
    for (let index = 0; index < samples.length; index++) {
        const low = binary.charCodeAt(index * 2);
        const high = binary.charCodeAt(index * 2 + 1);
        samples[index] = (high << 8) | low;
    }
    return samples;
}

/**
 * Open a realtime session. Resolves once the WebSocket is open. Attach
 * `onEvent` to receive events (including session.created) from the first frame.
 */
export async function connectRealtime(
    options: RealtimeOptions = {},
): Promise<RealtimeSession> {
    const socket = new WebSocket(realtimeUrl(options));
    const listeners = new Map<string, Set<RealtimeListener>>();
    let resolveClosed: (detail: { code: number; reason: string }) => void;
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
        resolveClosed = resolve;
    });

    const dispatch = (event: RealtimeEvent, internal: boolean) => {
        const targets = [
            ...(listeners.get(event.type) ?? []),
            ...(listeners.get("*") ?? []),
        ];
        if (!internal && options.onEvent) targets.push(options.onEvent);
        for (const listener of targets) {
            try {
                listener(event);
            } catch (error) {
                console.error("[pollinations] realtime listener failed", error);
            }
        }
    };

    const session: RealtimeSession = {
        closed,
        on(type, listener) {
            const set = listeners.get(type) ?? new Set<RealtimeListener>();
            set.add(listener);
            listeners.set(type, set);
            return () => set.delete(listener);
        },
        send(event) {
            if (socket.readyState !== WS_OPEN) {
                throw new Error(
                    "Realtime session is closed; cannot send event",
                );
            }
            socket.send(JSON.stringify(event));
        },
        close() {
            if (socket.readyState !== WS_CLOSED) socket.close();
        },
    };

    return new Promise((resolve, reject) => {
        let opened = false;
        const signal = options.signal;
        const timer = setTimeout(
            () => fail(new Error("Realtime connection timed out")),
            options.timeout ?? DEFAULT_TIMEOUT_MS,
        );

        const cleanup = () => clearTimeout(timer);
        const detachAbort = () => signal?.removeEventListener("abort", onAbort);

        function fail(error: unknown) {
            if (opened) return;
            opened = true;
            cleanup();
            detachAbort();
            if (socket.readyState !== WS_CLOSED) {
                try {
                    socket.close();
                } catch {
                    // A socket that failed to connect may reject close().
                }
            }
            reject(error);
        }

        function onAbort() {
            if (!opened) {
                fail(
                    signal?.reason ?? new Error("Realtime connection aborted"),
                );
            } else if (socket.readyState !== WS_CLOSED) {
                socket.close();
            }
        }

        socket.addEventListener("open", () => {
            if (opened) return;
            opened = true;
            cleanup();
            if (options.session) {
                socket.send(
                    JSON.stringify({
                        type: "session.update",
                        session: options.session,
                    }),
                );
            }
            resolve(session);
        });

        socket.addEventListener("message", (event: MessageEvent) => {
            let realtimeEvent: RealtimeEvent;
            try {
                realtimeEvent = JSON.parse(String(event.data)) as RealtimeEvent;
            } catch {
                return; // Ignore non-JSON frames.
            }
            if (realtimeEvent && typeof realtimeEvent.type === "string") {
                dispatch(realtimeEvent, false);
            }
        });

        socket.addEventListener("error", (event: Event) => {
            const message =
                (event as { message?: string })?.message ??
                "Realtime connection error";
            if (!opened) fail(new Error(message));
            else dispatch({ type: "error", error: message }, true);
        });

        socket.addEventListener("close", (event: CloseEvent) => {
            cleanup();
            detachAbort();
            const detail = {
                code: event.code ?? 1000,
                reason: event.reason ?? "",
            };
            if (!opened)
                fail(new Error(`Realtime connection closed: ${detail.reason}`));
            resolveClosed(detail);
            dispatch({ type: "close", ...detail }, true);
        });

        if (signal) {
            if (signal.aborted) onAbort();
            else signal.addEventListener("abort", onAbort);
        }
    });
}
