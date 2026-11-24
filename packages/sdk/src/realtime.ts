import { DEFAULT_BASE_URL } from "./client.js";
import { PollinationsError } from "./types.js";

const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1";
const DEFAULT_CONNECT_TIMEOUT = 15_000;

export interface RealtimeEvent {
    type: string;
    [key: string]: unknown;
}

export interface RealtimeOptions {
    /** User-authorized secret key. Browser WebSockets send it in the URL. */
    apiKey: string;
    /** Realtime model id; defaults to openai/gpt-realtime-2.1. */
    model?: string;
    /** API base URL; defaults to https://gen.pollinations.ai. */
    baseUrl?: string;
    /** Optional OpenAI Realtime session.update payload. */
    session?: Record<string, unknown>;
    /** Receives each parsed Realtime event, including events arriving during connect. */
    onEvent: (event: RealtimeEvent) => void;
    /** Aborts the handshake or closes an open session. */
    signal?: AbortSignal;
    /** Maximum time to wait for the WebSocket handshake. Defaults to 15 seconds. */
    timeoutMs?: number;
}

export interface RealtimeSession {
    /** Send an OpenAI Realtime client event unchanged. */
    send(event: RealtimeEvent): void;
    /** Close the WebSocket session. */
    close(): void;
    /** Resolves with the WebSocket close code and reason. */
    closed: Promise<{ code: number; reason: string }>;
}

/** Open a Pollinations Realtime WebSocket and pass JSON events through. */
export async function connectRealtime(
    options: RealtimeOptions,
): Promise<RealtimeSession> {
    const {
        apiKey,
        model = DEFAULT_REALTIME_MODEL,
        baseUrl = DEFAULT_BASE_URL,
        session,
        onEvent,
        signal,
        timeoutMs = DEFAULT_CONNECT_TIMEOUT,
    } = options;

    if (typeof apiKey !== "string" || !apiKey.startsWith("sk_")) {
        throw new PollinationsError(
            "Realtime sessions require a secret sk_ API key",
            "INVALID_INPUT",
            400,
        );
    }
    if (typeof onEvent !== "function") {
        throw new PollinationsError(
            "Realtime sessions require an onEvent callback",
            "INVALID_INPUT",
            400,
        );
    }
    if (!(timeoutMs > 0)) {
        throw new PollinationsError(
            "Realtime connection timeout must be greater than zero",
            "INVALID_INPUT",
            400,
        );
    }
    if (signal?.aborted) {
        throw signal.reason ?? new Error("Realtime session aborted");
    }
    if (typeof WebSocket === "undefined") {
        throw new Error(
            "Realtime sessions require a global WebSocket implementation",
        );
    }

    const endpoint = new URL(`${baseUrl.replace(/\/+$/, "")}/v1/realtime`);
    if (endpoint.protocol === "https:") endpoint.protocol = "wss:";
    else if (endpoint.protocol === "http:") endpoint.protocol = "ws:";
    else {
        throw new PollinationsError(
            "Realtime baseUrl must use http or https",
            "INVALID_INPUT",
            400,
        );
    }
    endpoint.searchParams.set("model", model);
    endpoint.searchParams.set("key", apiKey);

    const socket = new WebSocket(endpoint);
    let opened = false;
    let resolveClosed!: (value: { code: number; reason: string }) => void;
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
        resolveClosed = resolve;
    });

    socket.addEventListener("message", ({ data }) => {
        if (typeof data !== "string") return;
        try {
            const event: unknown = JSON.parse(data);
            if (
                typeof event === "object" &&
                event !== null &&
                typeof (event as RealtimeEvent).type === "string"
            ) {
                onEvent(event as RealtimeEvent);
            }
        } catch {
            // Ignore non-JSON frames; the Realtime protocol uses JSON events.
        }
    });

    const opening = new Promise<RealtimeSession>((resolve, reject) => {
        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout>;
        let abortHandler = () => {};

        const removeOpeningListeners = () => {
            clearTimeout(timeoutId);
            socket.removeEventListener("open", handleOpen);
            socket.removeEventListener("error", handleError);
        };
        const rejectOpening = (error: unknown) => {
            if (settled) return;
            settled = true;
            removeOpeningListeners();
            signal?.removeEventListener("abort", abortHandler);
            reject(error);
        };
        const failOpening = (error: Error) => {
            rejectOpening(error);
            socket.close();
        };
        const handleOpen = () => {
            try {
                if (session) {
                    socket.send(
                        JSON.stringify({ type: "session.update", session }),
                    );
                }
                opened = true;
                settled = true;
                removeOpeningListeners();
                resolve({
                    send(event) {
                        if (socket.readyState !== WebSocket.OPEN) {
                            throw new Error("Realtime WebSocket is not open");
                        }
                        socket.send(JSON.stringify(event));
                    },
                    close() {
                        socket.close();
                    },
                    closed,
                });
            } catch (error) {
                failOpening(
                    error instanceof Error ? error : new Error(String(error)),
                );
            }
        };
        const handleError = () =>
            failOpening(new Error("Realtime WebSocket connection failed"));
        const handleClose = (event: CloseEvent) => {
            resolveClosed({ code: event.code, reason: event.reason });
            signal?.removeEventListener("abort", abortHandler);
            if (!opened) {
                rejectOpening(
                    new Error(
                        `Realtime WebSocket closed before opening (${event.code})`,
                    ),
                );
            }
        };
        abortHandler = () => {
            if (!opened) {
                rejectOpening(
                    signal?.reason ?? new Error("Realtime session aborted"),
                );
            }
            socket.close();
        };

        timeoutId = setTimeout(
            () =>
                failOpening(
                    new Error(
                        `Realtime WebSocket connection timed out after ${timeoutMs}ms`,
                    ),
                ),
            timeoutMs,
        );
        socket.addEventListener("open", handleOpen, { once: true });
        socket.addEventListener("error", handleError, { once: true });
        socket.addEventListener("close", handleClose, { once: true });
        signal?.addEventListener("abort", abortHandler, { once: true });
        if (signal?.aborted) abortHandler();
    });

    return opening;
}
