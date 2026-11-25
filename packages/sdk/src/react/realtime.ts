import { useCallback, useEffect, useRef, useState } from "react";
import {
    createRealtimeSession,
    type RealtimeEvent,
    type RealtimeModel,
    type RealtimeSession,
} from "../realtime.js";
import { useAuthActions, useAuthState } from "./hooks.js";

export type RealtimeStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface UseRealtimeSessionOptions {
    /** Realtime model. Defaults to `openai/gpt-realtime-2.1`. */
    model?: RealtimeModel;
    /** Sent as `session.update` when the socket opens. */
    session?: Record<string, unknown>;
    /** Connect as soon as the user is signed in. Defaults to true. */
    autoConnect?: boolean;
}

export interface UseRealtimeSessionValue {
    status: RealtimeStatus;
    /** Most recent event received, or null before the first one. */
    lastEvent: RealtimeEvent | null;
    error: Error | null;
    /** Send one Realtime event; queued until the socket opens. */
    send: (event: RealtimeEvent) => void;
    connect: () => void;
    disconnect: () => void;
}

/**
 * Realtime voice session bound to the signed-in Pollinations user.
 *
 * The user's key travels as `?key=` (browser WebSockets cannot set
 * headers). Play model audio through an `<audio>` element so the
 * browser's echo cancellation can use it as its reference.
 */
export function useRealtimeSession(
    options: UseRealtimeSessionOptions = {},
): UseRealtimeSessionValue {
    const { apiKey, isLoggedIn } = useAuthState();
    const { apiBaseUrl } = useAuthActions();
    const [status, setStatus] = useState<RealtimeStatus>("idle");
    const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const sessionRef = useRef<RealtimeSession | null>(null);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const disconnect = useCallback(() => {
        sessionRef.current?.close();
        sessionRef.current = null;
        setStatus("closed");
    }, []);

    const connect = useCallback(() => {
        if (!apiKey || sessionRef.current) return;
        setStatus("connecting");
        setError(null);
        const session = createRealtimeSession({
            apiKey,
            baseUrl: apiBaseUrl,
            model: optionsRef.current.model,
            session: optionsRef.current.session,
        });
        sessionRef.current = session;
        session.on((event) => setLastEvent(event));
        session.socket.addEventListener("close", () => {
            if (sessionRef.current === session) {
                sessionRef.current = null;
                setStatus("closed");
            }
        });
        session.ready.then(
            () => setStatus("open"),
            (err: unknown) => {
                setStatus("error");
                setError(err instanceof Error ? err : new Error(String(err)));
            },
        );
    }, [apiKey, apiBaseUrl]);

    useEffect(() => {
        if (isLoggedIn && options.autoConnect !== false) connect();
        return disconnect;
    }, [isLoggedIn, options.autoConnect, connect, disconnect]);

    const send = useCallback((event: RealtimeEvent) => {
        sessionRef.current?.send(event);
    }, []);

    return { status, lastEvent, error, send, connect, disconnect };
}
