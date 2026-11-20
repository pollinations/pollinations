import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    connectRealtime,
    type RealtimeEvent,
    type RealtimeSession,
    type RealtimeSessionOptions,
} from "../realtime.js";
import { useAuth } from "./hooks.js";

/** Connection state of a realtime session. */
export type RealtimeStatus =
    | "idle"
    | "connecting"
    | "connected"
    | "closed"
    | "error";

/** How many events `events` keeps. Enough for a transcript, bounded for memory. */
const EVENT_HISTORY = 100;

export interface UseRealtimeSessionOptions extends RealtimeSessionOptions {
    /** Called for every event, in arrival order. The latest callback wins. */
    onEvent?: (event: RealtimeEvent) => void;
}

export interface UseRealtimeSessionValue {
    status: RealtimeStatus;
    /** The open session, or null before `connect` succeeds. */
    session: RealtimeSession | null;
    error: Error | null;
    /** The most recent event, or null. */
    lastEvent: RealtimeEvent | null;
    /** The most recent `EVENT_HISTORY` events, oldest first. */
    events: RealtimeEvent[];
    /** Open a session with the signed-in user's key. */
    connect: () => Promise<void>;
    /** Close the session and clear `events`. */
    disconnect: () => void;
}

/**
 * A realtime voice session that runs on the signed-in user's key.
 *
 * A logout, a key change, or unmounting closes the socket. `connect()` with a
 * session already open replaces it. Read `lastEvent`, `events`, or pass
 * `onEvent`; call `session.send` and the `RealtimeSession` helpers for the
 * outgoing direction.
 *
 * @example
 * ```tsx
 * function TalkButton() {
 *   const { connect, disconnect, status, events } = useRealtimeSession({
 *     model: 'openai/gpt-realtime-2.1',
 *   });
 *   const transcript = events
 *     .filter((e) => e.type === 'response.audio_transcript.delta')
 *     .map((e) => e.delta)
 *     .join('');
 *   return (
 *     <>
 *       <button onClick={() => (status === 'connected' ? disconnect() : connect())}>
 *         {status}
 *       </button>
 *       <p>{transcript}</p>
 *     </>
 *   );
 * }
 * ```
 */
export function useRealtimeSession(
    options: UseRealtimeSessionOptions = {},
): UseRealtimeSessionValue {
    const { apiKey } = useAuth();
    const { model, baseUrl, onEvent } = options;
    const [status, setStatus] = useState<RealtimeStatus>("idle");
    const [error, setError] = useState<Error | null>(null);
    const [session, setSession] = useState<RealtimeSession | null>(null);
    const [events, setEvents] = useState<RealtimeEvent[]>([]);
    const sessionRef = useRef<RealtimeSession | null>(null);
    const attemptRef = useRef(0);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    const teardown = useCallback(() => {
        sessionRef.current?.close();
        sessionRef.current = null;
        setSession(null);
    }, []);

    // A logout or unmount closes the session in flight.
    useEffect(() => {
        if (apiKey) return;
        attemptRef.current += 1;
        teardown();
        setStatus("idle");
        return () => {
            attemptRef.current += 1;
            teardown();
        };
    }, [apiKey, teardown]);

    const connect = useCallback(async () => {
        if (!apiKey) {
            setError(new Error("Log in to Pollinations to start a session"));
            setStatus("error");
            return;
        }
        teardown();
        const attempt = attemptRef.current + 1;
        attemptRef.current = attempt;
        setStatus("connecting");
        setError(null);
        setEvents([]);
        try {
            const opened = await connectRealtime({ apiKey, model, baseUrl });
            if (attemptRef.current !== attempt) {
                opened.close();
                return;
            }
            sessionRef.current = opened;
            setSession(opened);
            setStatus("connected");
            opened.onEvent((event) => {
                onEventRef.current?.(event);
                setEvents((previous: RealtimeEvent[]) =>
                    [...previous, event].slice(-EVENT_HISTORY),
                );
            });
            opened.onClose(() => {
                if (attemptRef.current !== attempt) return;
                sessionRef.current = null;
                setSession(null);
                setStatus("closed");
            });
        } catch (err) {
            if (attemptRef.current !== attempt) return;
            const failure = err instanceof Error ? err : new Error(String(err));
            sessionRef.current = null;
            setSession(null);
            setError(failure);
            setStatus("error");
        }
    }, [apiKey, model, baseUrl, teardown]);

    const disconnect = useCallback(() => {
        attemptRef.current += 1;
        teardown();
        setEvents([]);
        setStatus("idle");
        setError(null);
    }, [teardown]);

    const lastEvent = events.length > 0 ? events[events.length - 1] : null;

    return useMemo(
        () => ({
            status,
            session,
            error,
            lastEvent,
            events,
            connect,
            disconnect,
        }),
        [status, session, error, lastEvent, events, connect, disconnect],
    );
}
