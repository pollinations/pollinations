import { PollinationsError } from "./types.js";

/** Realtime models served by `wss://gen.pollinations.ai/v1/realtime`. */
export type RealtimeModel =
    | "openai/gpt-realtime-2.1"
    | "openai/gpt-realtime-2.1-mini"
    | "openai/gpt-live-transcribe"
    | "google/gemini-3.8-live"
    | "google/gemini-3.5-transcribe-live"
    | "microsoft/mai-transcribe-2-streaming"
    | "elevenlabs/scribe-v3-live"
    | "elevenlabs/scribe-v2-realtime"
    | (string & {});

/** One OpenAI Realtime protocol event, passed through unchanged. */
export interface RealtimeEvent {
    type: string;
    [key: string]: unknown;
}

export interface RealtimeSessionOptions {
    /** User-authorized secret key (`sk_`). Sent as `?key=` for browser WebSockets. */
    apiKey?: string;
    /** API base URL. Defaults to `https://gen.pollinations.ai`. */
    baseUrl?: string;
    /** Realtime model. Defaults to `openai/gpt-realtime-2.1`. */
    model?: RealtimeModel;
    /** Sent as `session.update` when the socket opens. */
    session?: Record<string, unknown>;
    /** WebSocket constructor override, e.g. `ws` in Node or a test double. */
    webSocketImpl?: typeof WebSocket;
}

export interface RealtimeSession {
    /** The underlying socket, for advanced use. */
    socket: WebSocket;
    /** Resolves when the socket opens; rejects if it errors first. */
    ready: Promise<void>;
    /** Send one Realtime event. Events sent before open are queued. */
    send: (event: RealtimeEvent) => void;
    /** Subscribe to incoming events. Returns an unsubscribe function. */
    on: (handler: (event: RealtimeEvent) => void) => () => void;
    /** Close the session. Billing settles when the socket closes. */
    close: (code?: number, reason?: string) => void;
}

export const DEFAULT_REALTIME_MODEL: RealtimeModel = "openai/gpt-realtime-2.1";

/** Build the Realtime WebSocket URL for a base URL, model, and optional key. */
export function buildRealtimeUrl(options: RealtimeSessionOptions = {}): string {
    const base = (options.baseUrl ?? "https://gen.pollinations.ai").replace(
        /\/+$/,
        "",
    );
    const wsBase = base.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    const params = new URLSearchParams({
        model: options.model ?? DEFAULT_REALTIME_MODEL,
    });
    if (options.apiKey) params.set("key", options.apiKey);
    return `${wsBase}/v1/realtime?${params.toString()}`;
}

/**
 * Open a Realtime voice session.
 *
 * Events use the OpenAI Realtime protocol and pass through unchanged:
 * send `session.update`, `input_audio_buffer.append`, `response.create`,
 * and read `response.output_audio.delta` / transcript events back.
 *
 * @example
 * ```ts
 * const session = createRealtimeSession({
 *     apiKey,
 *     session: { type: "realtime", instructions: "Be concise." },
 * });
 * session.on((event) => console.log(event.type));
 * await session.ready;
 * session.send({ type: "response.create" });
 * ```
 */
export function createRealtimeSession(
    options: RealtimeSessionOptions = {},
): RealtimeSession {
    const Impl = options.webSocketImpl ?? globalThis.WebSocket;
    if (!Impl) {
        throw new PollinationsError(
            "No WebSocket implementation available; pass webSocketImpl",
            "INVALID_INPUT",
            400,
        );
    }
    const socket = new Impl(buildRealtimeUrl(options));
    const handlers = new Set<(event: RealtimeEvent) => void>();
    const queue: string[] = [];
    let opened = false;

    const ready = new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => {
            opened = true;
            if (options.session) {
                socket.send(
                    JSON.stringify({
                        type: "session.update",
                        session: options.session,
                    }),
                );
            }
            for (const item of queue.splice(0)) socket.send(item);
            resolve();
        });
        socket.addEventListener("error", () => {
            if (!opened) {
                reject(
                    new PollinationsError(
                        "Realtime WebSocket failed to connect",
                        "NETWORK_ERROR",
                        0,
                    ),
                );
            }
        });
    });

    socket.addEventListener("message", (message) => {
        let event: RealtimeEvent;
        try {
            event = JSON.parse(String(message.data)) as RealtimeEvent;
        } catch {
            return;
        }
        for (const handler of handlers) handler(event);
    });

    return {
        socket,
        ready,
        send(event) {
            const data = JSON.stringify(event);
            if (socket.readyState === Impl.OPEN) socket.send(data);
            else queue.push(data);
        },
        on(handler) {
            handlers.add(handler);
            return () => handlers.delete(handler);
        },
        close(code, reason) {
            socket.close(code, reason);
        },
    };
}
