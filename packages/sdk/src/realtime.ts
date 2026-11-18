/**
 * Realtime voice sessions over WebSocket.
 *
 * A thin wrapper around `wss://gen.pollinations.ai/v1/realtime` that opens a
 * session and passes [OI] Realtime events through in both directions, so a web
 * app can talk to `openai/gpt-realtime-2.1` in a few lines.
 *
 * @example
 * ```ts
 * import { connectRealtime } from '@pollinations/sdk';
 *
 * const session = await connectRealtime({ model: 'openai/gpt-realtime-2.1' });
 * session.on('response.audio_transcript.delta', (event) => {
 *     process.stdout.write(event.delta ?? '');
 * });
 * session.sendText('Say hello in one short sentence.');
 * ```
 */

import { DEFAULT_BASE_URL, getEnvVar } from "./client.js";
import { PollinationsError } from "./types.js";

/** The server's default realtime model. */
export const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1";

/**
 * An [OI] Realtime protocol event. Only the fields a voice app usually reads are
 * typed; every other field on the event is kept as-is.
 */
export interface RealtimeEvent {
    /** Event type, e.g. `response.audio_transcript.delta`. */
    type: string;
    event_id?: string;
    /**
     * Text on `response.audio_transcript.delta` and
     * `conversation.item.input_audio_transcription.delta`; base64 PCM16 audio
     * on `response.audio.delta`.
     */
    delta?: string;
    /** Finished text on `response.audio_transcript.done` and `...transcription.completed`. */
    transcript?: string;
    /** Session state on `session.created` and `session.updated`. */
    session?: Record<string, unknown>;
    /** Response state and billing usage on `response.done`. */
    response?: {
        id?: string;
        status?: string;
        usage?: Record<string, unknown>;
    };
    /** Error detail on `error`. */
    error?: {
        type?: string;
        code?: string;
        message?: string;
        param?: string;
    };
    [key: string]: unknown;
}

/** A client event. Any object with a `type` is sent as-is. */
export interface RealtimeClientEvent {
    type: string;
    [key: string]: unknown;
}

export interface RealtimeSessionOptions {
    /** Pollinations API key. Defaults to `POLLINATIONS_API_KEY`. */
    apiKey?: string;
    /** API base URL (defaults to `https://gen.pollinations.ai`). */
    baseUrl?: string;
    /** Realtime model (defaults to `openai/gpt-realtime-2.1`). */
    model?: string;
    /** Abort while connecting; the socket is closed. */
    signal?: AbortSignal;
}

type EventHandler = (event: RealtimeEvent) => void;
type CloseHandler = (event: CloseEvent) => void;

/**
 * Build the session URL. A browser cannot set an `Authorization` header on a
 * WebSocket, so the key travels in the query string, which the gateway redacts
 * from logs.
 */
export function realtimeUrl(options: RealtimeSessionOptions = {}): string {
    const baseUrl = trimTrailingSlashes(options.baseUrl || DEFAULT_BASE_URL);
    const url = new URL(`${baseUrl}/v1/realtime`);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.searchParams.set("model", options.model || DEFAULT_REALTIME_MODEL);
    const apiKey = options.apiKey || getEnvVar("POLLINATIONS_API_KEY");
    if (apiKey) url.searchParams.set("key", apiKey);
    return url.toString();
}

// A loop, not `/\/+$/`: the base URL is caller input and a regex over a long
// run of slashes backtracks.
function trimTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
    return value.slice(0, end);
}

/** One open realtime session. Events pass through untouched. */
export class RealtimeSession {
    private readonly socket: WebSocket;
    private readonly queue: string[] = [];
    private readonly handlers = new Map<string, Set<EventHandler>>();
    private readonly anyHandlers = new Set<EventHandler>();
    private readonly closeHandlers = new Set<CloseHandler>();
    private opened: boolean;

    constructor(socket: WebSocket) {
        this.socket = socket;
        // `connectRealtime` hands over a socket that is already open, so the
        // listener below would never fire. 1 is WebSocket.OPEN.
        this.opened = socket.readyState === 1;
        socket.addEventListener("open", () => {
            this.opened = true;
            for (const payload of this.queue.splice(0)) socket.send(payload);
        });
        socket.addEventListener("message", (message) => {
            const event = parseEvent(message.data);
            if (!event) return;
            for (const handler of this.anyHandlers) handler(event);
            for (const handler of this.handlers.get(event.type) ?? []) {
                handler(event);
            }
        });
        socket.addEventListener("close", (event) => {
            for (const handler of this.closeHandlers) handler(event);
        });
    }

    /** Send a client event. Events sent before the socket opens are queued. */
    send(event: RealtimeClientEvent): void {
        const payload = JSON.stringify(event);
        if (this.opened) this.socket.send(payload);
        else this.queue.push(payload);
    }

    /** Handle one event type. Returns an unsubscribe function. */
    on(type: string, handler: EventHandler): () => void {
        const handlers = this.handlers.get(type) ?? new Set<EventHandler>();
        handlers.add(handler);
        this.handlers.set(type, handlers);
        return () => {
            handlers.delete(handler);
            if (handlers.size === 0) this.handlers.delete(type);
        };
    }

    /** Handle every event type. Returns an unsubscribe function. */
    onEvent(handler: EventHandler): () => void {
        this.anyHandlers.add(handler);
        return () => {
            this.anyHandlers.delete(handler);
        };
    }

    /** Called when the socket closes, including after `close()`. */
    onClose(handler: CloseHandler): () => void {
        this.closeHandlers.add(handler);
        return () => {
            this.closeHandlers.delete(handler);
        };
    }

    /** Update the session, e.g. `{ instructions, voice, turn_detection }`. */
    updateSession(session: Record<string, unknown>): void {
        this.send({ type: "session.update", session });
    }

    /**
     * Ask a voice model to reply to a text turn. Transcription sessions accept
     * audio only.
     */
    sendText(text: string): void {
        this.send({
            type: "conversation.item.create",
            item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text }],
            },
        });
        this.send({ type: "response.create" });
    }

    /** Append base64 PCM16 audio to the input buffer. */
    appendAudio(base64Audio: string): void {
        this.send({ type: "input_audio_buffer.append", audio: base64Audio });
    }

    /** Close the current input item so the model can answer it. */
    commitAudio(): void {
        this.send({ type: "input_audio_buffer.commit" });
    }

    /** Close the session. */
    close(): void {
        this.socket.close();
    }
}

function parseEvent(data: unknown): RealtimeEvent | null {
    if (typeof data !== "string") return null;
    try {
        const event = JSON.parse(data) as RealtimeEvent;
        return typeof event?.type === "string" ? event : null;
    } catch {
        return null;
    }
}

/**
 * Open a realtime session. Resolves once the socket is open, so `send` works
 * immediately.
 *
 * @example Transcription session
 * ```ts
 * const session = await connectRealtime({ model: 'openai/gpt-live-transcribe' });
 * session.on('conversation.item.input_audio_transcription.completed', (event) => {
 *     console.log(event.transcript);
 * });
 * session.appendAudio(pcm16Base64);
 * session.commitAudio();
 * ```
 */
export async function connectRealtime(
    options: RealtimeSessionOptions = {},
): Promise<RealtimeSession> {
    const socket = new WebSocket(realtimeUrl(options));

    await new Promise<void>((resolve, reject) => {
        const fail = (message: string) => {
            reject(new PollinationsError(message, "REALTIME_CONNECTION", 0));
            socket.close();
        };
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener(
            "error",
            () => fail("Realtime session could not be opened"),
            { once: true },
        );
        socket.addEventListener(
            "close",
            (event) =>
                fail(
                    `Realtime session closed before it opened (${event.code}${event.reason ? `: ${event.reason}` : ""})`,
                ),
            { once: true },
        );
        options.signal?.addEventListener(
            "abort",
            () =>
                reject(
                    new PollinationsError(
                        "Realtime session aborted",
                        "CANCELLED",
                        499,
                    ),
                ),
            { once: true },
        );
    });

    return new RealtimeSession(socket);
}
