import { PollinationsError } from "./types.js";

/**
 * Realtime voice and transcription sessions over the OpenAI-compatible
 * Realtime WebSocket at gen.pollinations.ai.
 *
 * Events use the OpenAI Realtime protocol:
 * https://developers.openai.com/api/docs/guides/realtime-conversations
 */

export const REALTIME_DEFAULT_BASE_URL = "https://gen.pollinations.ai";
export const REALTIME_DEFAULT_MODEL = "openai/gpt-realtime-2.1";

/** The slice of the WebSocket interface a realtime session needs. */
export interface RealtimeWebSocket {
    send(data: string): void;
    close(): void;
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: ((event: unknown) => void) | null;
    onclose: (() => void) | null;
    readonly readyState: number;
}

export type RealtimeWebSocketConstructor = new (
    url: string,
) => RealtimeWebSocket;

/** One OpenAI Realtime protocol event, sent or received. */
export type RealtimeEvent = { type: string } & Record<string, unknown>;

export interface RealtimeSessionOptions {
    /**
     * API key (https://enter.pollinations.ai/keys). Browser WebSockets
     * cannot set headers, so the key travels in the documented `?key=`
     * query parameter.
     */
    apiKey: string;
    /**
     * Realtime model (default "openai/gpt-realtime-2.1"). Selecting
     * `elevenlabs/scribe-v2-realtime` or `elevenlabs/scribe-v3-live`
     * starts a transcription session.
     */
    model?: string;
    /** API base URL (default https://gen.pollinations.ai). */
    baseUrl?: string;
    /**
     * WebSocket constructor. Defaults to the global `WebSocket`; on
     * Node without one, pass the `ws` package's class here.
     */
    WebSocket?: RealtimeWebSocketConstructor;
    /** Called with every server event after the socket opens. */
    onEvent?: (event: RealtimeEvent) => void;
    /** Called when the socket reports an error. */
    onError?: (error: unknown) => void;
    /** Called when the socket closes. */
    onClose?: () => void;
}

export interface RealtimeSession {
    /** Resolves when the socket opens; rejects if it errors first. */
    readonly ready: Promise<void>;
    /**
     * Send an OpenAI Realtime client event, e.g. `session.update` or
     * `input_audio_buffer.append`. Throws while the socket is not open.
     */
    send(event: RealtimeEvent): void;
    /** End the session. Billing settles when the socket closes. */
    close(): void;
}

/** WebSocket URL for a realtime session (`http`→`ws`, model and key as query params). */
export function buildRealtimeUrl(
    options: Pick<RealtimeSessionOptions, "apiKey" | "model" | "baseUrl">,
): string {
    const base = (options.baseUrl ?? REALTIME_DEFAULT_BASE_URL)
        .replace(/\/$/, "")
        .replace(/^http/, "ws");
    const model = options.model ?? REALTIME_DEFAULT_MODEL;
    const params = new URLSearchParams({
        model,
        key: options.apiKey,
    });
    return `${base}/v1/realtime?${params}`;
}

const WS_OPEN = 1;

/**
 * Open a realtime session and pass OpenAI Realtime events through in both
 * directions. Await `session.ready`, then `send` client events; server
 * events arrive via `onEvent`.
 */
export function createRealtimeSession(
    options: RealtimeSessionOptions,
): RealtimeSession {
    const WebSocketImpl =
        options.WebSocket ??
        (globalThis as { WebSocket?: RealtimeWebSocketConstructor })
            .WebSocket;
    if (!WebSocketImpl) {
        throw new PollinationsError(
            "No WebSocket implementation available; pass one via the WebSocket option (e.g. the `ws` package on Node).",
            "REALTIME",
            400,
        );
    }

    const ws = new WebSocketImpl(buildRealtimeUrl(options));
    let opened = false;

    const ready = new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
            opened = true;
            resolve();
        };
        ws.onerror = (event) => {
            if (!opened) {
                reject(
                    event instanceof Error
                        ? event
                        : new PollinationsError(
                              "Realtime WebSocket failed to connect",
                              "REALTIME",
                              0,
                          ),
                );
            }
            options.onError?.(event);
        };
    });

    ws.onmessage = (event) => {
        try {
            const data =
                typeof event.data === "string"
                    ? event.data
                    : String(event.data);
            options.onEvent?.(JSON.parse(data) as RealtimeEvent);
        } catch (err) {
            options.onError?.(err);
        }
    };
    ws.onclose = () => options.onClose?.();

    return {
        ready,
        send(event: RealtimeEvent) {
            if (!opened || ws.readyState !== WS_OPEN) {
                throw new PollinationsError(
                    "Realtime session is not open yet; await session.ready first",
                    "REALTIME",
                    400,
                );
            }
            ws.send(JSON.stringify(event));
        },
        close() {
            ws.close();
        },
    };
}
