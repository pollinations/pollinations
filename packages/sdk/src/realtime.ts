import { PollinationsError } from "./types.js";

export const DEFAULT_REALTIME_BASE_URL = "https://gen.pollinations.ai";
export const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1";

export type RealtimeStatus = "connecting" | "open" | "closed";

export interface RealtimeClientEvent {
    type: string;
    [key: string]: unknown;
}

export interface RealtimeServerEvent {
    type: string;
    event_id?: string;
    [key: string]: unknown;
}

export interface RealtimeCloseInfo {
    code: number;
    reason: string;
    wasClean: boolean;
}

export interface WebSocketLike {
    readonly readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    addEventListener(
        type: "open" | "message" | "error" | "close",
        listener: (event: unknown) => void,
    ): void;
    removeEventListener(
        type: "open" | "message" | "error" | "close",
        listener: (event: unknown) => void,
    ): void;
}

export type WebSocketConstructor = new (url: string) => WebSocketLike;

export interface RealtimeConnectOptions {
    /** Realtime model ID (default: "openai/gpt-realtime-2.1") */
    model?: string;
    /** Secret API key (sk_...). Falls back to POLLINATIONS_API_KEY in Node/Deno. */
    apiKey?: string;
    /** Base API URL (default: "https://gen.pollinations.ai") */
    baseUrl?: string;
    /** AbortSignal to cancel connection or close an active session */
    signal?: AbortSignal;
    /** Custom WebSocket constructor (defaults to globalThis.WebSocket) */
    WebSocket?: WebSocketConstructor;
}

export interface RealtimeSession extends AsyncIterable<RealtimeServerEvent> {
    readonly model: string;
    readonly url: string;
    readonly status: RealtimeStatus;
    send(event: RealtimeClientEvent): void;
    appendAudio(pcm16: Int16Array | ArrayBuffer | Uint8Array | string): void;
    commitAudio(): void;
    createResponse(response?: Record<string, unknown>): void;
    updateSession(session: Record<string, unknown>): void;
    on(
        eventType: string,
        listener: (event: RealtimeServerEvent) => void,
    ): () => void;
    onClose(listener: (info: RealtimeCloseInfo) => void): () => void;
    onError(listener: (error: Error) => void): () => void;
    close(code?: number, reason?: string): void;
}

function getEnvApiKey(): string | undefined {
    try {
        const g = globalThis as Record<string, unknown>;
        if (g.process && typeof g.process === "object") {
            const proc = g.process as {
                env?: Record<string, string | undefined>;
            };
            if (proc.env?.POLLINATIONS_API_KEY) {
                return proc.env.POLLINATIONS_API_KEY;
            }
        }
        if (g.Deno && typeof g.Deno === "object") {
            const deno = g.Deno as {
                env?: { get?: (k: string) => string | undefined };
            };
            const val = deno.env?.get?.("POLLINATIONS_API_KEY");
            if (val) return val;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

function validateRealtimeApiKey(apiKey: string | undefined): string {
    const trimmed = apiKey?.trim();
    if (!trimmed) {
        throw new PollinationsError(
            "An API key (sk_) is required for realtime sessions. Pass apiKey or set POLLINATIONS_API_KEY.",
            "UNAUTHORIZED",
            401,
        );
    }
    if (
        trimmed.startsWith("pk_") ||
        trimmed.startsWith("sess_") ||
        trimmed.startsWith("ag_")
    ) {
        throw new PollinationsError(
            "Realtime WebSocket sessions require a secret key (sk_); publishable, session, and agent keys are not accepted.",
            "INVALID_API_KEY",
            401,
        );
    }
    return trimmed;
}

export function buildRealtimeUrl(
    baseUrl: string,
    model: string,
    apiKey: string,
): string {
    const url = new URL(baseUrl);
    if (url.protocol === "https:") url.protocol = "wss:";
    else if (url.protocol === "http:") url.protocol = "ws:";
    else if (url.protocol !== "wss:" && url.protocol !== "ws:") {
        throw new PollinationsError(
            `Unsupported protocol for realtime URL: ${url.protocol}`,
            "INVALID_INPUT",
            400,
        );
    }

    const basePath = url.pathname.replace(/\/+$/, "");
    url.pathname = basePath.endsWith("/v1/realtime")
        ? basePath
        : `${basePath}/v1/realtime`;
    url.searchParams.set("model", model);
    url.searchParams.set("key", apiKey);
    return url.toString();
}

/** Encode 16-bit PCM audio samples to base64 for input_audio_buffer.append. */
export function pcm16ToBase64(
    pcm16: Int16Array | ArrayBuffer | Uint8Array,
): string {
    const bytes =
        pcm16 instanceof Uint8Array
            ? pcm16
            : pcm16 instanceof ArrayBuffer
              ? new Uint8Array(pcm16)
              : new Uint8Array(
                    pcm16.buffer,
                    pcm16.byteOffset,
                    pcm16.byteLength,
                );

    if (typeof Buffer !== "undefined") {
        return Buffer.from(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength,
        ).toString("base64");
    }

    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

/** Decode base64 audio from response.audio.delta into Int16Array PCM16 samples. */
export function base64ToPcm16(base64: string): Int16Array {
    if (typeof Buffer !== "undefined") {
        const buf = Buffer.from(base64, "base64");
        const copy = new Uint8Array(buf.byteLength);
        copy.set(buf);
        return new Int16Array(copy.buffer);
    }

    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
}

/**
 * Open a realtime WebSocket session on `wss://gen.pollinations.ai/v1/realtime`
 * and pass OpenAI Realtime events through.
 */
export async function connectRealtime(
    options: RealtimeConnectOptions = {},
): Promise<RealtimeSession> {
    const model = options.model ?? DEFAULT_REALTIME_MODEL;
    const apiKey = validateRealtimeApiKey(options.apiKey ?? getEnvApiKey());
    const baseUrl = options.baseUrl ?? DEFAULT_REALTIME_BASE_URL;
    const url = buildRealtimeUrl(baseUrl, model, apiKey);

    const WsImpl =
        options.WebSocket ??
        (globalThis.WebSocket as unknown as WebSocketConstructor | undefined);
    if (!WsImpl) {
        return Promise.reject(
            new PollinationsError(
                "No WebSocket implementation found. Pass options.WebSocket in this runtime.",
                "UNSUPPORTED_RUNTIME",
                500,
            ),
        );
    }

    if (options.signal?.aborted) {
        return Promise.reject(
            new PollinationsError("Request was cancelled", "CANCELLED", 499),
        );
    }

    return new Promise<RealtimeSession>((resolve, reject) => {
        const ws = new WsImpl(url);
        let status: RealtimeStatus = "connecting";
        let settled = false;

        const eventListeners = new Map<
            string,
            Set<(event: RealtimeServerEvent) => void>
        >();
        const closeListeners = new Set<(info: RealtimeCloseInfo) => void>();
        const errorListeners = new Set<(error: Error) => void>();

        const emit = (event: RealtimeServerEvent) => {
            const exact = eventListeners.get(event.type);
            if (exact) {
                for (const fn of exact) fn(event);
            }
            const wildcard = eventListeners.get("*");
            if (wildcard) {
                for (const fn of wildcard) fn(event);
            }
        };

        const session: RealtimeSession = {
            model,
            url,
            get status() {
                return status;
            },
            send(event: RealtimeClientEvent) {
                if (status !== "open") {
                    throw new PollinationsError(
                        `Cannot send event "${event.type}" while session is ${status}.`,
                        "INVALID_STATE",
                        400,
                    );
                }
                ws.send(JSON.stringify(event));
            },
            appendAudio(pcm16) {
                const audio =
                    typeof pcm16 === "string" ? pcm16 : pcm16ToBase64(pcm16);
                session.send({ type: "input_audio_buffer.append", audio });
            },
            commitAudio() {
                session.send({ type: "input_audio_buffer.commit" });
            },
            createResponse(response) {
                session.send(
                    response
                        ? { type: "response.create", response }
                        : { type: "response.create" },
                );
            },
            updateSession(sessionConfig) {
                session.send({
                    type: "session.update",
                    session: sessionConfig,
                });
            },
            on(eventType, listener) {
                let set = eventListeners.get(eventType);
                if (!set) {
                    set = new Set();
                    eventListeners.set(eventType, set);
                }
                set.add(listener);
                return () => {
                    set?.delete(listener);
                };
            },
            onClose(listener) {
                closeListeners.add(listener);
                return () => {
                    closeListeners.delete(listener);
                };
            },
            onError(listener) {
                errorListeners.add(listener);
                return () => {
                    errorListeners.delete(listener);
                };
            },
            close(code = 1000, reason = "Normal closure") {
                if (status === "closed") return;
                status = "closed";
                ws.close(code, reason);
            },
            async *[Symbol.asyncIterator]() {
                const queue: RealtimeServerEvent[] = [];
                let waiting: (() => void) | null = null;
                let done = status === "closed";

                const offMsg = session.on("*", (ev) => {
                    queue.push(ev);
                    if (waiting) {
                        const wake = waiting;
                        waiting = null;
                        wake();
                    }
                });
                const offClose = session.onClose(() => {
                    done = true;
                    if (waiting) {
                        const wake = waiting;
                        waiting = null;
                        wake();
                    }
                });

                try {
                    while (!done || queue.length > 0) {
                        if (queue.length > 0) {
                            yield queue.shift() as RealtimeServerEvent;
                        } else {
                            await new Promise<void>((r) => {
                                waiting = r;
                            });
                        }
                    }
                } finally {
                    offMsg();
                    offClose();
                }
            },
        };

        const onAbort = () => {
            if (!settled) {
                settled = true;
                cleanup();
                session.close(1000, "Aborted");
                reject(
                    new PollinationsError(
                        "Request was cancelled",
                        "CANCELLED",
                        499,
                    ),
                );
                return;
            }
            session.close(1000, "Aborted");
        };

        const handleOpen = () => {
            if (settled) return;
            settled = true;
            status = "open";
            resolve(session);
        };

        const handleMessage = (raw: unknown) => {
            const data = (raw as { data?: unknown })?.data;
            if (typeof data !== "string") return;
            try {
                const parsed = JSON.parse(data) as RealtimeServerEvent;
                if (parsed && typeof parsed.type === "string") {
                    emit(parsed);
                }
            } catch (err) {
                const error =
                    err instanceof Error
                        ? err
                        : new Error("Failed to parse realtime event");
                for (const fn of errorListeners) fn(error);
            }
        };

        const handleError = (raw: unknown) => {
            const errObj = (raw as { error?: unknown })?.error;
            const error =
                errObj instanceof Error
                    ? errObj
                    : new PollinationsError(
                          "Realtime WebSocket connection error",
                          "CONNECTION_ERROR",
                          502,
                      );
            if (!settled) {
                settled = true;
                status = "closed";
                cleanup();
                reject(error);
                return;
            }
            for (const fn of errorListeners) fn(error);
        };

        const handleClose = (raw: unknown) => {
            const ev = raw as Partial<RealtimeCloseInfo> | undefined;
            const info: RealtimeCloseInfo = {
                code: typeof ev?.code === "number" ? ev.code : 1000,
                reason: typeof ev?.reason === "string" ? ev.reason : "",
                wasClean: Boolean(ev?.wasClean),
            };
            status = "closed";
            cleanup();
            if (!settled) {
                settled = true;
                reject(
                    new PollinationsError(
                        info.reason ||
                            `Realtime WebSocket closed (${info.code})`,
                        "CONNECTION_CLOSED",
                        502,
                    ),
                );
                return;
            }
            for (const fn of closeListeners) fn(info);
        };

        const cleanup = () => {
            options.signal?.removeEventListener("abort", onAbort);
        };

        options.signal?.addEventListener("abort", onAbort, { once: true });
        ws.addEventListener("open", handleOpen);
        ws.addEventListener("message", handleMessage);
        ws.addEventListener("error", handleError);
        ws.addEventListener("close", handleClose);
    });
}
