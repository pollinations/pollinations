import { PollinationsError } from "./types.js";

export const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1";
export const DEFAULT_REALTIME_WS_URL = "wss://gen.pollinations.ai";

export interface ConnectRealtimeOptions {
    /** API key (`sk_...`). Defaults to POLLINATIONS_API_KEY environment variable. */
    apiKey?: string;
    /** Realtime model name (default: "openai/gpt-realtime-2.1") */
    model?: string;
    /** WebSocket base URL (default: "wss://gen.pollinations.ai") */
    baseUrl?: string;
    /** Endpoint path (default: "/v1/realtime") */
    path?: string;
    /** Custom WebSocket implementation if not running in a browser or modern Node environment. */
    WebSocketClass?: typeof WebSocket;
}

export type RealtimeEventHandler<T = unknown> = (event: T) => void;

export interface RealtimeSession {
    readonly socket: WebSocket;
    readonly status: "connecting" | "connected" | "closed" | "error";
    send: (event: string | object) => void;
    sendAudio: (pcmData: Int16Array | ArrayBuffer | string) => void;
    on: (type: string, handler: RealtimeEventHandler) => () => void;
    close: (code?: number, reason?: string) => void;
}

/** Convert 16-bit PCM samples (24kHz mono) into a base64 string. */
export function pcm16ToBase64(pcmData: Int16Array | ArrayBuffer): string {
    const buffer =
        pcmData instanceof ArrayBuffer
            ? pcmData
            : pcmData.buffer.slice(
                  pcmData.byteOffset,
                  pcmData.byteOffset + pcmData.byteLength,
              );
    const bytes = new Uint8Array(buffer);
    if (typeof Buffer !== "undefined") {
        return Buffer.from(bytes).toString("base64");
    }
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/** Convert base64 audio back into a 16-bit PCM Int16Array. */
export function base64ToPcm16(base64: string): Int16Array {
    let uint8: Uint8Array;
    if (typeof Buffer !== "undefined") {
        const buf = Buffer.from(base64, "base64");
        uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    } else {
        const binary = atob(base64);
        uint8 = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            uint8[i] = binary.charCodeAt(i);
        }
    }
    return new Int16Array(
        uint8.buffer,
        uint8.byteOffset,
        Math.floor(uint8.byteLength / 2),
    );
}

function resolveWsUrl(
    baseUrl: string = DEFAULT_REALTIME_WS_URL,
    path: string = "/v1/realtime",
    apiKey?: string,
    model?: string,
): string {
    let ws = baseUrl.trim();
    if (ws.startsWith("https://")) ws = `wss://${ws.slice(8)}`;
    else if (ws.startsWith("http://")) ws = `ws://${ws.slice(7)}`;
    else if (!ws.startsWith("ws://") && !ws.startsWith("wss://"))
        ws = `wss://${ws}`;

    ws = ws.replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${ws}${cleanPath}`);

    if (model) url.searchParams.set("model", model);
    if (apiKey) url.searchParams.set("key", apiKey);

    return url.toString();
}

/**
 * Open a realtime WebSocket voice session to Pollinations.
 */
export function connectRealtime(
    options: ConnectRealtimeOptions = {},
): RealtimeSession {
    const WS = options.WebSocketClass || globalThis.WebSocket;
    if (!WS) {
        throw new PollinationsError(
            "WebSocket is not supported in this environment",
            "UNSUPPORTED_ENVIRONMENT",
            500,
        );
    }

    const apiKey =
        options.apiKey ||
        (typeof process !== "undefined"
            ? process.env?.POLLINATIONS_API_KEY
            : undefined);
    const model = options.model || DEFAULT_REALTIME_MODEL;
    const wsUrl = resolveWsUrl(options.baseUrl, options.path, apiKey, model);

    const socket = new WS(wsUrl);
    let status: "connecting" | "connected" | "closed" | "error" = "connecting";
    const queue: string[] = [];
    const listeners = new Map<string, Set<RealtimeEventHandler>>();

    function emit(type: string, data: unknown) {
        listeners.get(type)?.forEach((h) => {
            try {
                h(data);
            } catch (e) {
                console.error(e);
            }
        });
        if (
            type !== "*" &&
            type !== "open" &&
            type !== "close" &&
            type !== "error"
        ) {
            listeners.get("*")?.forEach((h) => {
                try {
                    h(data);
                } catch (e) {
                    console.error(e);
                }
            });
        }
    }

    socket.addEventListener("open", (evt) => {
        status = "connected";
        while (queue.length > 0 && socket.readyState === WS.OPEN) {
            const next = queue.shift();
            if (next) socket.send(next);
        }
        emit("open", evt);
    });

    socket.addEventListener("message", (evt) => {
        try {
            const raw =
                typeof evt.data === "string"
                    ? evt.data
                    : new TextDecoder().decode(evt.data as ArrayBuffer);
            const data = JSON.parse(raw);
            if (data && typeof data.type === "string") {
                emit(data.type, data);
            } else {
                emit("*", data);
            }
        } catch {
            emit("*", evt.data);
        }
    });

    socket.addEventListener("error", (err) => {
        status = "error";
        emit("error", err);
    });

    socket.addEventListener("close", (evt) => {
        status = "closed";
        emit("close", evt);
    });

    return {
        get socket() {
            return socket;
        },
        get status() {
            return status;
        },
        send(event: string | object) {
            const payload =
                typeof event === "string" ? event : JSON.stringify(event);
            if (socket.readyState === WS.OPEN) {
                socket.send(payload);
            } else if (socket.readyState === WS.CONNECTING) {
                queue.push(payload);
            } else {
                throw new PollinationsError(
                    "Cannot send event: WebSocket is closed",
                    "SOCKET_CLOSED",
                    400,
                );
            }
        },
        sendAudio(pcmData: Int16Array | ArrayBuffer | string) {
            const base64 =
                typeof pcmData === "string" ? pcmData : pcm16ToBase64(pcmData);
            this.send({
                type: "input_audio_buffer.append",
                audio: base64,
            });
        },
        on(type: string, handler: RealtimeEventHandler) {
            let set = listeners.get(type);
            if (!set) {
                set = new Set();
                listeners.set(type, set);
            }
            set.add(handler);
            return () => {
                listeners.get(type)?.delete(handler);
            };
        },
        close(code = 1000, reason?: string) {
            if (
                socket.readyState === WS.OPEN ||
                socket.readyState === WS.CONNECTING
            ) {
                socket.close(code, reason);
            }
        },
    };
}
