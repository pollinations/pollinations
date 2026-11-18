import { DEFAULT_BASE_URL } from "./client.js";
import { PollinationsError } from "./types.js";

/** Default realtime model: a voice and multimodal session. */
export const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1";

const WS_CONNECTING = 0;
const WS_OPEN = 1;

export type RealtimeStatus = "connecting" | "open" | "closed" | "error";

/** One OpenAI Realtime event, in either direction. */
export type RealtimeEvent = { type: string; [key: string]: unknown };

/**
 * Session config sent as `session.update` when the socket opens.
 * A transcription model makes the server create a transcription session.
 */
export type RealtimeSessionUpdate = {
    type?: "realtime" | "transcription";
    instructions?: string;
    voice?: string;
    input_audio_format?: string;
    output_audio_format?: string;
    turn_detection?: Record<string, unknown> | null;
    [key: string]: unknown;
};

export interface RealtimeOptions {
    /** Secret key (`sk_...`) with a positive balance. */
    apiKey: string;
    /** Realtime model. Defaults to `openai/gpt-realtime-2.1`. */
    model?: string;
    /** API host. Defaults to `https://gen.pollinations.ai`. */
    baseUrl?: string;
    /** Session config sent as `session.update` once the socket opens. */
    session?: RealtimeSessionUpdate;
    onEvent?: (event: RealtimeEvent) => void;
    onStatus?: (status: RealtimeStatus, error?: Error) => void;
    /** Closes the session when aborted. */
    signal?: AbortSignal;
    /** WebSocket constructor, for runtimes without a global one. */
    WebSocketImpl?: typeof WebSocket;
}

export interface RealtimeSession {
    /** Queues the event until the socket is open. */
    send: (event: RealtimeEvent) => void;
    updateSession: (session: RealtimeSessionUpdate) => void;
    close: () => void;
    readonly socket: WebSocket | null;
}

/** The realtime WebSocket URL. The key travels in the query: browsers cannot set headers. */
export function realtimeUrl(
    options: Pick<RealtimeOptions, "apiKey" | "model" | "baseUrl">,
): string {
    if (!options.apiKey) {
        throw new PollinationsError(
            "A Pollinations API key is required for a realtime session",
            "INVALID_INPUT",
            401,
        );
    }
    let host = options.baseUrl ?? DEFAULT_BASE_URL;
    while (host.endsWith("/")) host = host.slice(0, -1);
    if (host.startsWith("http")) host = `ws${host.slice(4)}`;
    const params = new URLSearchParams({
        model: options.model ?? DEFAULT_REALTIME_MODEL,
        key: options.apiKey,
    });
    return `${host}/v1/realtime?${params.toString()}`;
}

/**
 * Open a realtime session and pass its OpenAI Realtime events through.
 *
 * Billing settles one session total when the socket closes.
 */
export function connectRealtime(options: RealtimeOptions): RealtimeSession {
    const Socket =
        options.WebSocketImpl ??
        (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!Socket) {
        throw new PollinationsError(
            "No WebSocket implementation available. Pass one as WebSocketImpl.",
            "INVALID_INPUT",
            500,
        );
    }

    const socket = new Socket(realtimeUrl(options));
    const queued: string[] = [];
    let closed = false;

    const status = (next: RealtimeStatus, error?: Error) => {
        options.onStatus?.(next, error);
    };

    const deliver = (event: RealtimeEvent) => {
        options.onEvent?.(event);
    };

    const send = (event: RealtimeEvent) => {
        const data = JSON.stringify(event);
        if (socket.readyState === WS_OPEN) socket.send(data);
        else if (socket.readyState === WS_CONNECTING) queued.push(data);
    };

    const session: RealtimeSession = {
        send,
        updateSession: (update) =>
            send({ type: "session.update", session: update }),
        close: () => {
            if (closed) return;
            closed = true;
            socket.close();
        },
        get socket() {
            return socket;
        },
    };

    socket.addEventListener("open", () => {
        status("open");
        if (options.session) {
            socket.send(
                JSON.stringify({
                    type: "session.update",
                    session: options.session,
                }),
            );
        }
        while (queued.length > 0) socket.send(queued.shift() as string);
    });

    socket.addEventListener("message", (event: MessageEvent) => {
        if (typeof event.data !== "string") return;
        let parsed: unknown;
        try {
            parsed = JSON.parse(event.data);
        } catch {
            return;
        }
        if (
            parsed === null ||
            typeof parsed !== "object" ||
            typeof (parsed as { type?: unknown }).type !== "string"
        ) {
            return;
        }
        deliver(parsed as RealtimeEvent);
    });

    socket.addEventListener("error", () => {
        status(
            "error",
            new PollinationsError(
                "Realtime session failed",
                "NETWORK_ERROR",
                0,
            ),
        );
    });

    socket.addEventListener("close", () => {
        status("closed");
    });

    if (options.signal) {
        if (options.signal.aborted) session.close();
        else
            options.signal.addEventListener("abort", session.close, {
                once: true,
            });
    }

    return session;
}
