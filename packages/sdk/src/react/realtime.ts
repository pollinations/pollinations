import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
    connectRealtime,
    type RealtimeEvent,
    type RealtimeSession,
} from "../realtime.js";
import { AuthContext } from "./contexts.js";

export interface UseRealtimeOptions {
    /** Realtime model id. Defaults to openai/gpt-realtime-2.1. */
    model?: string;
    /** Called with each event from the server. */
    onEvent?: (event: RealtimeEvent) => void;
}

export interface UseRealtimeValue {
    /** Open a session using the signed-in account key. */
    connect: () => RealtimeSession | null;
    /** Send an event on the active session, if any. */
    send: (event: RealtimeEvent) => void;
    /** Close the active session, if any. */
    close: () => void;
    /** Whether the socket is open. */
    isConnected: boolean;
}

/**
 * Realtime voice session bound to the PolliProvider account.
 *
 * @example
 * ```tsx
 * const { connect, send, isConnected } = useRealtime({
 *   onEvent: (event) => console.log(event.type),
 * });
 * ```
 */
export function useRealtime(options: UseRealtimeOptions = {}): UseRealtimeValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error(
            "useRealtime must be used within a <PolliProvider>",
        );
    }
    const { apiKey, apiBaseUrl } = ctx;
    const sessionRef = useRef<RealtimeSession | null>(null);
    const onEventRef = useRef(options.onEvent);
    onEventRef.current = options.onEvent;
    const [isConnected, setIsConnected] = useState(false);

    const close = useCallback(() => {
        sessionRef.current?.close();
        sessionRef.current = null;
        setIsConnected(false);
    }, []);

    const connect = useCallback(() => {
        if (sessionRef.current || !apiKey) return sessionRef.current;
        const session = connectRealtime({
            apiKey,
            baseUrl: apiBaseUrl,
            model: options.model,
            onEvent: (event) => onEventRef.current?.(event),
        });
        session.socket.addEventListener("open", () => setIsConnected(true));
        session.socket.addEventListener("close", () => {
            sessionRef.current = null;
            setIsConnected(false);
        });
        session.socket.addEventListener("error", () => setIsConnected(false));
        sessionRef.current = session;
        return session;
    }, [apiKey, apiBaseUrl, options.model]);

    const send = useCallback((event: RealtimeEvent) => {
        sessionRef.current?.send(event);
    }, []);

    useEffect(() => close, [close]);

    return { connect, send, close, isConnected };
}
