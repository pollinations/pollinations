import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
    type ConnectRealtimeOptions,
    connectRealtime,
    type RealtimeSession,
} from "../realtime.js";
import { AuthContext } from "./contexts.js";

export interface UseRealtimeOptions
    extends Omit<ConnectRealtimeOptions, "apiKey"> {
    /** Override the API key from PolliProvider */
    apiKey?: string;
    /** Automatically connect on mount */
    autoConnect?: boolean;
}

export type RealtimeStatus =
    | "idle"
    | "connecting"
    | "connected"
    | "closed"
    | "error";

export interface UseRealtimeResult {
    session: RealtimeSession | null;
    status: RealtimeStatus;
    error: Error | null;
    connect: () => RealtimeSession;
    disconnect: () => void;
    send: (event: string | object) => void;
    sendAudio: (pcmData: Int16Array | ArrayBuffer | string) => void;
}

/**
 * React hook for managing a Pollinations Realtime voice session.
 */
export function useRealtime(
    options: UseRealtimeOptions = {},
): UseRealtimeResult {
    const auth = useContext(AuthContext);
    const effectiveKey = options.apiKey || auth?.apiKey || undefined;

    const [status, setStatus] = useState<RealtimeStatus>("idle");
    const [error, setError] = useState<Error | null>(null);
    const sessionRef = useRef<RealtimeSession | null>(null);

    const disconnect = useCallback(() => {
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
        setStatus("closed");
    }, []);

    const connect = useCallback(() => {
        if (sessionRef.current) {
            sessionRef.current.close();
        }

        setStatus("connecting");
        setError(null);

        try {
            const session = connectRealtime({
                ...options,
                apiKey: effectiveKey,
            });

            sessionRef.current = session;

            session.on("open", () => setStatus("connected"));
            session.on("error", (err: unknown) => {
                setStatus("error");
                const errObj =
                    err && typeof err === "object"
                        ? (err as { message?: string })
                        : null;
                setError(
                    err instanceof Error
                        ? err
                        : new Error(
                              String(
                                  errObj?.message ||
                                      "Realtime connection error",
                              ),
                          ),
                );
            });
            session.on("close", () => setStatus("closed"));

            return session;
        } catch (err: unknown) {
            setStatus("error");
            const e = err instanceof Error ? err : new Error(String(err));
            setError(e);
            throw e;
        }
    }, [effectiveKey, options.baseUrl, options.model, options.path]);

    const send = useCallback((event: string | object) => {
        if (!sessionRef.current) {
            throw new Error(
                "Cannot send event: Realtime session not connected",
            );
        }
        sessionRef.current.send(event);
    }, []);

    const sendAudio = useCallback(
        (pcmData: Int16Array | ArrayBuffer | string) => {
            if (!sessionRef.current) {
                throw new Error(
                    "Cannot send audio: Realtime session not connected",
                );
            }
            sessionRef.current.sendAudio(pcmData);
        },
        [],
    );

    useEffect(() => {
        if (options.autoConnect) {
            connect();
        }
        return () => {
            if (sessionRef.current) {
                sessionRef.current.close();
                sessionRef.current = null;
            }
        };
    }, [connect, options.autoConnect]);

    return {
        session: sessionRef.current,
        status,
        error,
        connect,
        disconnect,
        send,
        sendAudio,
    };
}
