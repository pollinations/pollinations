import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Pollinations } from "../client.js";
import {
    isOutageError,
    pollinationsErrorFromResponse,
} from "../error-response.js";
import { fetchModelCatalog, type ModelCatalog } from "../models.js";
import {
    openRealtimeSession,
    playRealtimeAudio,
    type RealtimeEvent,
    type RealtimeSession,
    type RealtimeSessionOptions,
    startMicrophone,
} from "../realtime.js";
import type {
    AccountBalance,
    AccountProfile,
    AudioBinaryResponse,
    AudioGenerateOptions,
    ImageGenerateOptions,
    ImageResponse,
    KeyInfo,
    KeyUsageOptions,
    ModelInfo,
    TextGenerateOptions,
    TranscribeOptions,
    TranscriptionResponse,
    UsageResponse,
    VideoGenerateOptions,
    VideoResponse,
} from "../types.js";
import { PollinationsError } from "../types.js";
import {
    type AuthActionsValue,
    AuthContext,
    type AuthContextValue,
    type AuthStateValue,
} from "./contexts.js";

export interface AccountResourceValue<T> {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
}

export interface UseAccountKeyUsageOptions extends KeyUsageOptions {
    enabled?: boolean;
}

export type UseAccountProfileValue = AccountResourceValue<AccountProfile>;
export type UseAccountBalanceValue = AccountResourceValue<AccountBalance>;
export type UseAccountKeyValue = AccountResourceValue<KeyInfo>;
export type UseAccountKeyUsageValue = AccountResourceValue<UsageResponse>;

type AccountFetcher<T> = (apiBaseUrl: string, apiKey: string) => Promise<T>;

/** How often an account hook retries while Pollinations is down. */
const OUTAGE_RETRY_MS = 30_000;

function useRequiredAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error(
            "Pollinations auth hooks must be used within a <PolliProvider>",
        );
    }
    return ctx;
}

/** Auth state without fetching account data. */
export function useAuthState(): AuthStateValue {
    const { apiKey, isLoggedIn, isHydrated, error } = useRequiredAuth();
    return useMemo(
        () => ({ apiKey, isLoggedIn, isHydrated, error }),
        [apiKey, isLoggedIn, isHydrated, error],
    );
}

/** Login/logout actions and provider settings. */
export function useAuthActions(): AuthActionsValue {
    const { login, logout, setApiKey, enterUrl, apiBaseUrl } =
        useRequiredAuth();
    return useMemo(
        () => ({ login, logout, setApiKey, enterUrl, apiBaseUrl }),
        [login, logout, setApiKey, enterUrl, apiBaseUrl],
    );
}

/** Auth state and actions. Use account hooks to fetch data. */
export function useAuth(): AuthContextValue {
    return useRequiredAuth();
}

function accountUrl(
    apiBaseUrl: string,
    path: string,
    params?: URLSearchParams,
): string {
    let end = apiBaseUrl.length;
    while (apiBaseUrl[end - 1] === "/") end--;
    const qs = params?.toString();
    return `${apiBaseUrl.slice(0, end)}${path}${qs ? `?${qs}` : ""}`;
}

async function fetchAccountJson<T>(
    apiBaseUrl: string,
    apiKey: string,
    path: string,
    params?: URLSearchParams,
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(accountUrl(apiBaseUrl, path, params), {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
    } catch {
        // No response at all: an outage to isOutageError, like a 5xx.
        throw new PollinationsError("Network error", "NETWORK_ERROR", 0);
    }

    if (!response.ok) {
        throw await pollinationsErrorFromResponse(response);
    }

    return response.json() as Promise<T>;
}

function useAccountResource<T>(
    fetcher: AccountFetcher<T>,
    enabled = true,
): AccountResourceValue<T> {
    const { apiKey, apiBaseUrl, logout } = useRequiredAuth();
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const reqIdRef = useRef(0);

    const refresh = useCallback(async () => {
        const reqId = ++reqIdRef.current;
        if (!enabled || !apiKey) {
            setData(null);
            setIsLoading(false);
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const result = await fetcher(apiBaseUrl, apiKey);
            if (reqId !== reqIdRef.current) return;
            setData(result);
        } catch (err) {
            if (reqId !== reqIdRef.current) return;
            if (err instanceof PollinationsError && err.status === 401) {
                logout();
                return;
            }
            setData(null);
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            if (reqId === reqIdRef.current) setIsLoading(false);
        }
    }, [apiKey, apiBaseUrl, enabled, fetcher, logout]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // While Pollinations is down, check again on a timer.
    useEffect(() => {
        if (!isOutageError(error)) return;
        const timer = setTimeout(() => void refresh(), OUTAGE_RETRY_MS);
        return () => clearTimeout(timer);
    }, [error, refresh]);

    return useMemo(
        () => ({ data, isLoading, error, refresh }),
        [data, isLoading, error, refresh],
    );
}

/** Current account profile for the delegated key. */
export function useAccountProfile(options: { enabled?: boolean } = {}) {
    const { enabled = true } = options;
    const fetcher = useCallback(
        (apiBaseUrl: string, apiKey: string) =>
            fetchAccountJson<AccountProfile>(
                apiBaseUrl,
                apiKey,
                "/account/profile",
            ),
        [],
    );
    return useAccountResource(fetcher, enabled);
}

export interface UseModelCatalogValue {
    models: ModelInfo[];
    allowedModelIds: ReadonlySet<string>;
    isLoggedIn: boolean;
    isLoading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
}

const EMPTY_MODELS: ModelInfo[] = [];
const EMPTY_ALLOWED: ReadonlySet<string> = new Set();

/**
 * Loads the public catalog, plus allowedModelIds when logged in.
 */
export function useModelCatalog(
    options: { baseUrl?: string; enabled?: boolean } = {},
): UseModelCatalogValue {
    const { baseUrl, enabled = true } = options;
    const { apiKey, isLoggedIn } = useRequiredAuth();
    const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
    const [isLoading, setIsLoading] = useState(enabled);
    const [error, setError] = useState<Error | null>(null);
    const reqIdRef = useRef(0);

    const refresh = useCallback(async () => {
        const reqId = ++reqIdRef.current;
        if (!enabled) {
            setCatalog(null);
            setIsLoading(false);
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const result = await fetchModelCatalog({ apiKey, baseUrl });
            if (reqId !== reqIdRef.current) return;
            setCatalog(result);
        } catch (err) {
            if (reqId !== reqIdRef.current) return;
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            if (reqId === reqIdRef.current) setIsLoading(false);
        }
    }, [apiKey, baseUrl, enabled]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return useMemo(() => {
        const models = catalog?.models ?? EMPTY_MODELS;
        const allowedModelIds = catalog?.allowedModelIds ?? EMPTY_ALLOWED;
        return {
            models,
            allowedModelIds,
            isLoggedIn,
            isLoading,
            error,
            refresh,
        };
    }, [catalog, isLoggedIn, isLoading, error, refresh]);
}

/** Current visible balance for the delegated key. */
export function useAccountBalance(options: { enabled?: boolean } = {}) {
    const { enabled = true } = options;
    const fetcher = useCallback(
        (apiBaseUrl: string, apiKey: string) =>
            fetchAccountJson<AccountBalance>(
                apiBaseUrl,
                apiKey,
                "/account/balance",
            ),
        [],
    );
    return useAccountResource(fetcher, enabled);
}

/** Current delegated key metadata. */
export function useAccountKey(options: { enabled?: boolean } = {}) {
    const { enabled = true } = options;
    const fetcher = useCallback(
        (apiBaseUrl: string, apiKey: string) =>
            fetchAccountJson<KeyInfo>(apiBaseUrl, apiKey, "/account/key"),
        [],
    );
    return useAccountResource(fetcher, enabled);
}

/** Usage for the current delegated key only. */
export function useAccountKeyUsage(
    options: UseAccountKeyUsageOptions = {},
): UseAccountKeyUsageValue {
    const {
        enabled = true,
        days,
        limit,
        before,
        before_event_id,
        granularity,
        period,
    } = options;

    const fetcher = useCallback(
        (apiBaseUrl: string, apiKey: string) => {
            const params = new URLSearchParams();
            if (days) params.set("days", String(days));
            if (limit) params.set("limit", String(limit));
            if (before) params.set("before", before);
            if (before_event_id) params.set("before_event_id", before_event_id);
            if (granularity) params.set("granularity", granularity);
            if (period) params.set("period", period);
            return fetchAccountJson<UsageResponse>(
                apiBaseUrl,
                apiKey,
                "/account/key/usage",
                params,
            );
        },
        [days, limit, before, before_event_id, granularity, period],
    );
    return useAccountResource(fetcher, enabled);
}

type GenerationRequest<A extends unknown[], T> = (
    client: Pollinations,
    signal: AbortSignal,
    ...args: A
) => Promise<T>;

export interface GenerationValue<A extends unknown[], T> {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
    /** Start a request. A request still in flight is cancelled. */
    run: (...args: A) => Promise<void>;
    /** Run again with the arguments of the last `run`. */
    rerun: () => Promise<void>;
    /** Abort the request in flight. The last result is kept. */
    cancel: () => void;
}

/**
 * Request state for one generation call made with the provider's key. Nothing
 * is sent until `run`. A key change or unmount aborts the request in flight and
 * clears the result, so a stale response never reaches the next user.
 */
function useGeneration<A extends unknown[], T>(
    request: GenerationRequest<A, T>,
): GenerationValue<A, T> {
    const { apiKey, logout } = useRequiredAuth();
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const lastArgsRef = useRef<A | null>(null);

    const cancel = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setIsLoading(false);
    }, []);

    // A key change resets state and aborts the request in flight.
    useEffect(() => {
        lastArgsRef.current = null;
        setData(null);
        setError(null);
        return cancel;
    }, [apiKey, cancel]);

    const run = useCallback(
        async (...args: A) => {
            controllerRef.current?.abort();
            const controller = new AbortController();
            controllerRef.current = controller;
            lastArgsRef.current = args;
            setIsLoading(true);
            setError(null);
            try {
                if (!apiKey) {
                    throw new Error("Log in to Pollinations to generate");
                }
                const result = await request(
                    new Pollinations({ apiKey }),
                    controller.signal,
                    ...args,
                );
                if (!controller.signal.aborted) setData(result);
            } catch (err) {
                if (controller.signal.aborted) return;
                if (err instanceof PollinationsError && err.status === 401) {
                    logout();
                }
                setData(null);
                setError(err instanceof Error ? err : new Error(String(err)));
            } finally {
                if (controllerRef.current === controller) {
                    controllerRef.current = null;
                    setIsLoading(false);
                }
            }
        },
        [apiKey, logout, request],
    );

    const rerun = useCallback(
        () =>
            lastArgsRef.current
                ? run(...lastArgsRef.current)
                : Promise.resolve(),
        [run],
    );

    return useMemo(
        () => ({ data, isLoading, error, run, rerun, cancel }),
        [data, isLoading, error, run, rerun, cancel],
    );
}

const imageRequest = (
    client: Pollinations,
    signal: AbortSignal,
    prompt: string,
    options?: ImageGenerateOptions,
) => client.image(prompt, { ...options, signal });

const textRequest = (
    client: Pollinations,
    signal: AbortSignal,
    prompt: string,
    options?: TextGenerateOptions,
) => client.text(prompt, { ...options, signal });

const audioRequest = (
    client: Pollinations,
    signal: AbortSignal,
    text: string,
    options?: AudioGenerateOptions,
) => client.audio(text, { ...options, signal });

const videoRequest = (
    client: Pollinations,
    signal: AbortSignal,
    prompt: string,
    options?: VideoGenerateOptions,
) => client.video(prompt, { ...options, signal });

const transcriptionRequest = (
    client: Pollinations,
    signal: AbortSignal,
    audio: ArrayBuffer | Blob,
    options?: TranscribeOptions,
) => client.transcribe(audio, { ...options, signal });

/** Image bytes, content type and keyless URL. `run(prompt, options?)`. */
export function useImageGeneration() {
    return useGeneration<
        [prompt: string, options?: ImageGenerateOptions],
        ImageResponse
    >(imageRequest);
}

/** Plain text reply. `run(prompt, options?)`. */
export function useTextGeneration() {
    return useGeneration<
        [prompt: string, options?: TextGenerateOptions],
        string
    >(textRequest);
}

/** Speech or music bytes. `run(text, options?)`. */
export function useAudioGeneration() {
    return useGeneration<
        [text: string, options?: AudioGenerateOptions],
        AudioBinaryResponse
    >(audioRequest);
}

/** Video bytes. `run(prompt, options?)`. */
export function useVideoGeneration() {
    return useGeneration<
        [prompt: string, options?: VideoGenerateOptions],
        VideoResponse
    >(videoRequest);
}

/** Transcript of an audio file. `run(audio, options?)`. */
export function useTranscription() {
    return useGeneration<
        [audio: ArrayBuffer | Blob, options?: TranscribeOptions],
        TranscriptionResponse
    >(transcriptionRequest);
}

export interface UseRealtimeSessionOptions extends RealtimeSessionOptions {
    /** Start the microphone on connect. Default true. */
    microphone?: boolean;
}

export type RealtimeStatus = "idle" | "connecting" | "connected" | "closed";

export interface UseRealtimeSessionValue {
    status: RealtimeStatus;
    /** The model is producing a response. */
    isSpeaking: boolean;
    /** Microphone audio is being streamed. */
    isListening: boolean;
    error: Error | null;
    /**
     * Open the session, play the model's audio and start the microphone. Call
     * it from a click: browsers need a gesture for the mic and for playback.
     */
    connect: () => Promise<void>;
    /** Close the session, which settles its billing. */
    disconnect: () => void;
    /** Start the microphone for a new turn. */
    startListening: () => Promise<void>;
    /** Stop the microphone. Call it before `input_audio_buffer.commit`. */
    stopListening: () => void;
    /** Send one OpenAI Realtime event, for example `input_audio_buffer.commit`. */
    send: (event: RealtimeEvent) => void;
}

const NOOP = () => {};

/**
 * A realtime voice session wired to the provider's key: connect once, then hold
 * turns with `startListening` and `stopListening` and send Realtime events. The
 * session closes when the component unmounts.
 *
 * @example
 * ```tsx
 * const realtime = useRealtimeSession({ instructions: "Be concise." });
 * return <button onClick={() => realtime.connect()}>Talk</button>;
 * ```
 */
export function useRealtimeSession(
    options: UseRealtimeSessionOptions = {},
): UseRealtimeSessionValue {
    const { apiKey } = useRequiredAuth();
    const [status, setStatus] = useState<RealtimeStatus>("idle");
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const sessionRef = useRef<RealtimeSession | null>(null);
    const releaseRef = useRef<() => void>(NOOP);
    const microphoneRef = useRef<() => void>(NOOP);
    // A connect still in flight, and whether the caller gave up on it.
    const connectingRef = useRef(false);
    const cancelledRef = useRef(false);
    // Options and key are read when connecting, so a fresh object each render
    // does not close and reopen the session.
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const apiKeyRef = useRef(apiKey);
    apiKeyRef.current = apiKey;

    const stopListening = useCallback(() => {
        microphoneRef.current();
        microphoneRef.current = NOOP;
        setIsListening(false);
    }, []);

    const disconnect = useCallback(() => {
        // Cancels a connect that has not resolved yet, so its socket and audio
        // context are closed instead of being orphaned.
        cancelledRef.current = true;
        stopListening();
        releaseRef.current();
        releaseRef.current = NOOP;
        const session = sessionRef.current;
        sessionRef.current = null;
        session?.close();
        setIsSpeaking(false);
        setStatus("closed");
    }, [stopListening]);

    const startListening = useCallback(async () => {
        const session = sessionRef.current;
        if (!session || microphoneRef.current !== NOOP) return;
        const stop = await startMicrophone(session);
        // The session ended while the microphone was starting.
        if (sessionRef.current !== session) {
            stop();
            return;
        }
        microphoneRef.current = stop;
        setIsListening(true);
    }, []);

    const connect = useCallback(async () => {
        if (connectingRef.current || sessionRef.current) return;
        connectingRef.current = true;
        cancelledRef.current = false;
        setStatus("connecting");
        setError(null);
        try {
            const { microphone = true, ...sessionOptions } = optionsRef.current;
            const session = await openRealtimeSession({
                ...sessionOptions,
                apiKey: sessionOptions.apiKey ?? apiKeyRef.current ?? undefined,
            });
            if (cancelledRef.current) {
                session.close();
                return;
            }
            sessionRef.current = session;
            const playback = playRealtimeAudio(session);
            // Release what exists already, so a denied microphone cannot leave
            // an audio context and an open socket behind.
            const stops = [() => playback.stop()];
            releaseRef.current = () => {
                for (const stop of stops) stop();
            };
            session.onEvent((event) => {
                if (event.type === "response.created") setIsSpeaking(true);
                if (event.type === "response.done") setIsSpeaking(false);
            });
            // The server can end the session; the UI has to say so.
            session.onClose(() => {
                if (sessionRef.current === session) disconnect();
            });
            if (microphone) {
                const stop = await startMicrophone(session);
                if (cancelledRef.current) {
                    stop();
                    return;
                }
                stops.push(stop);
                microphoneRef.current = stop;
                setIsListening(true);
            }
            setStatus("connected");
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
            disconnect();
        } finally {
            connectingRef.current = false;
        }
    }, [disconnect]);

    // Unmount leaves no open socket behind.
    useEffect(() => () => disconnect(), [disconnect]);

    const send = useCallback((event: RealtimeEvent) => {
        sessionRef.current?.send(event);
    }, []);

    return useMemo(
        () => ({
            status,
            isSpeaking,
            isListening,
            error,
            connect,
            disconnect,
            startListening,
            stopListening,
            send,
        }),
        [
            status,
            isSpeaking,
            isListening,
            error,
            connect,
            disconnect,
            startListening,
            stopListening,
            send,
        ],
    );
}
