import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
    connectRealtime,
    type RealtimeConnectOptions,
    type RealtimeSession,
} from "../realtime.js";
import { PollinationsError } from "../types.js";
import { AuthContext } from "./contexts.js";

export type UseRealtimeStatus =
    | "idle"
    | "connecting"
    | "open"
    | "closed"
    | "error";

export interface UseRealtimeOptions
    extends Omit<RealtimeConnectOptions, "apiKey" | "baseUrl"> {
    apiKey?: string;
    baseUrl?: string;
}

export interface UseRealtimeValue {
    status: UseRealtimeStatus;
    session: RealtimeSession | null;
    error: Error | null;
    connect: (
        overrides?: Partial<RealtimeConnectOptions>,
    ) => Promise<RealtimeSession>;
    close: (code?: number, reason?: string) => void;
}

/**
 * React hook for managing a Pollinations realtime voice/transcription session.
 * Automatically closes the active session on unmount, logout, or API key change.
 */
export function useRealtime(
    options: UseRealtimeOptions = {},
): UseRealtimeValue {
    const auth = useContext(AuthContext);
    const [status, setStatus] = useState<UseRealtimeStatus>("idle");
    const [session, setSession] = useState<RealtimeSession | null>(null);
    const [error, setError] = useState<Error | null>(null);

    const sessionRef = useRef<RealtimeSession | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const resolvedApiKey = options.apiKey ?? auth?.apiKey ?? undefined;
    const resolvedBaseUrl = options.baseUrl;

    const close = useCallback((code?: number, reason?: string) => {
        abortRef.current?.abort();
        abortRef.current = null;
        if (sessionRef.current) {
            sessionRef.current.close(code, reason);
            sessionRef.current = null;
        }
        setSession(null);
        setStatus((prev) => (prev === "idle" ? "idle" : "closed"));
    }, []);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            abortRef.current = null;
            if (sessionRef.current) {
                sessionRef.current.close(1000, "Key changed or unmounted");
                sessionRef.current = null;
            }
            setSession(null);
            setStatus((prev) => (prev === "idle" ? "idle" : "closed"));
        };
    }, [resolvedApiKey]);

    const connect = useCallback(
        async (overrides: Partial<RealtimeConnectOptions> = {}) => {
            abortRef.current?.abort();
            if (sessionRef.current) {
                sessionRef.current.close(1000, "Reconnecting");
                sessionRef.current = null;
            }

            const controller = new AbortController();
            abortRef.current = controller;
            setError(null);
            setStatus("connecting");

            const externalSignal = overrides.signal ?? optionsRef.current.signal;
            const onExternalAbort = () => controller.abort();
            externalSignal?.addEventListener("abort", onExternalAbort, {
                once: true,
            });

            try {
                const nextSession = await connectRealtime({
                    model: overrides.model ?? optionsRef.current.model,
                    apiKey: overrides.apiKey ?? resolvedApiKey,
                    baseUrl: overrides.baseUrl ?? resolvedBaseUrl,
                    WebSocket:
                        overrides.WebSocket ?? optionsRef.current.WebSocket,
                    signal: controller.signal,
                });

                if (controller.signal.aborted) {
                    nextSession.close(1000, "Aborted");
                    throw new PollinationsError(
                        "Request was cancelled",
                        "CANCELLED",
                        499,
                    );
                }

                sessionRef.current = nextSession;
                setSession(nextSession);
                setStatus("open");

                nextSession.onClose(() => {
                    if (sessionRef.current === nextSession) {
                        sessionRef.current = null;
                        setSession(null);
                        setStatus("closed");
                    }
                });
                nextSession.onError((err) => {
                    if (sessionRef.current === nextSession) {
                        setError(err);
                    }
                });

                return nextSession;
            } catch (err) {
                const nextError =
                    err instanceof Error ? err : new Error(String(err));
                setError(nextError);
                setSession(null);
                setStatus("error");
                throw nextError;
            } finally {
                externalSignal?.removeEventListener("abort", onExternalAbort);
            }
        },
        [resolvedApiKey, resolvedBaseUrl],
    );

    return { status, session, error, connect, close };
}
