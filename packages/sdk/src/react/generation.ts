import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Pollinations } from "../client.js";
import {
    type AudioResponseExt,
    type ImageResponseExt,
    type VideoResponseExt,
    wrapAudioResponse,
    wrapImageResponse,
    wrapVideoResponse,
} from "../extras.js";
import {
    type AudioGenerateOptions,
    type ChatOptions,
    type ImageGenerateOptions,
    type Message,
    PollinationsError,
    type TextGenerateOptions,
    type VideoGenerateOptions,
} from "../types.js";
import { useRequiredAuth } from "./hooks.js";

/**
 * Default generation API host. The account API exposed by <PolliProvider>
 * (`apiBaseUrl`) is a different service, so generation hooks target the
 * generation host unless overridden per hook.
 */
export const DEFAULT_GENERATION_BASE_URL = "https://gen.pollinations.ai";

/** Shared request-state options for the generation hooks. */
export interface GenerationRequestOptions {
    /** Run automatically when the input or options change (default: true). */
    enabled?: boolean;
    /** Override the API key; defaults to the key from <PolliProvider>. */
    apiKey?: string;
    /** Generation host. Defaults to `https://gen.pollinations.ai`. */
    baseUrl?: string;
    /** External abort signal, combined with the hook's own cancellation. */
    signal?: AbortSignal;
}

/**
 * Request state owned by a generation hook. Mirrors the shape of the account
 * hooks (`useAccount*`): a value, a loading flag, an error, plus re-run and
 * cancellation controls. Hooks never render anything themselves.
 */
export interface GenerationValue<T> {
    /** Most recent successful result, or null. */
    result: T | null;
    /** True while a request is in flight. */
    isLoading: boolean;
    /** Last request error (401 errors log the user out instead). */
    error: Error | null;
    /** Run the request again with the current input and options. */
    generate: () => Promise<T | null>;
    /** Abort the in-flight request and keep the last result. */
    cancel: () => void;
    /** Abort the request and clear the result and error. */
    reset: () => void;
}

function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}

function isCancellation(err: unknown): boolean {
    if (err instanceof PollinationsError) {
        return err.code === "CANCELLED" || err.status === 499;
    }
    return err instanceof Error && err.name === "AbortError";
}

type Resolver<T> = (
    client: Pollinations,
    signal: AbortSignal,
) => Promise<T> | null;

function useGenerationResource<T>(
    requestKey: string,
    options: GenerationRequestOptions,
    resolve: Resolver<T>,
): GenerationValue<T> {
    const { apiKey, logout } = useRequiredAuth();
    const {
        enabled = true,
        apiKey: apiKeyOverride,
        baseUrl = DEFAULT_GENERATION_BASE_URL,
        signal,
    } = options;
    const effectiveApiKey = apiKeyOverride ?? apiKey;

    const [result, setResult] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const reqIdRef = useRef(0);
    const controllerRef = useRef<AbortController | null>(null);
    // Keep the latest resolver (it closes over the current input/options)
    // without making `generate` a new function on every render.
    const resolveRef = useRef(resolve);
    resolveRef.current = resolve;

    const cancel = useCallback(() => {
        reqIdRef.current++;
        controllerRef.current?.abort();
        controllerRef.current = null;
        setIsLoading(false);
    }, []);

    const reset = useCallback(() => {
        reqIdRef.current++;
        controllerRef.current?.abort();
        controllerRef.current = null;
        setResult(null);
        setError(null);
        setIsLoading(false);
    }, []);

    const generate = useCallback(async (): Promise<T | null> => {
        const reqId = ++reqIdRef.current;
        controllerRef.current?.abort();

        if (!enabled || !effectiveApiKey) {
            controllerRef.current = null;
            setResult(null);
            setError(null);
            setIsLoading(false);
            return null;
        }

        const controller = new AbortController();
        controllerRef.current = controller;
        if (signal) {
            if (signal.aborted) {
                controller.abort();
            } else {
                signal.addEventListener("abort", () => controller.abort(), {
                    once: true,
                });
            }
        }

        setIsLoading(true);
        setError(null);
        try {
            const client = new Pollinations({
                apiKey: effectiveApiKey,
                baseUrl,
            });
            const value = await resolveRef.current(client, controller.signal);
            if (reqId !== reqIdRef.current) return null;
            if (value === null) {
                setResult(null);
                return null;
            }
            setResult(value);
            return value;
        } catch (err) {
            if (reqId !== reqIdRef.current) return null;
            if (isCancellation(err)) return null;
            if (err instanceof PollinationsError && err.status === 401) {
                logout();
                return null;
            }
            setResult(null);
            setError(toError(err));
            return null;
        } finally {
            if (reqId === reqIdRef.current) setIsLoading(false);
        }
    }, [enabled, effectiveApiKey, baseUrl, signal, logout]);

    // Re-run whenever the input changes. `requestKey` is a stable encoding of
    // the input/options that does not change identity between renders.
    // biome-ignore lint/correctness/useExhaustiveDependencies: requestKey re-runs on input change
    useEffect(() => {
        void generate();
    }, [generate, requestKey]);

    return useMemo(
        () => ({ result, isLoading, error, generate, cancel, reset }),
        [result, isLoading, error, generate, cancel, reset],
    );
}

// ============================================================================
// Image
// ============================================================================

export type UseImageOptions = ImageGenerateOptions & GenerationRequestOptions;
export type UseImageValue = GenerationValue<ImageResponseExt>;

/** Generate an image from a prompt. Re-runs when the prompt or options change. */
export function useImage(
    prompt: string,
    options: UseImageOptions = {},
): UseImageValue {
    const { enabled, apiKey, baseUrl, signal, ...imageOptions } = options;
    const requestKey = useMemo(
        () => `${prompt}\u0000${JSON.stringify(imageOptions)}`,
        [prompt, imageOptions],
    );
    return useGenerationResource(
        requestKey,
        { enabled, apiKey, baseUrl, signal },
        (client, requestSignal) =>
            prompt
                ? client
                      .image(prompt, { ...imageOptions, signal: requestSignal })
                      .then(wrapImageResponse)
                : null,
    );
}

// ============================================================================
// Text
// ============================================================================

export type UseTextOptions = TextGenerateOptions & GenerationRequestOptions;
export type UseTextValue = GenerationValue<string>;

/** Generate text from a prompt. Re-runs when the prompt or options change. */
export function useText(
    prompt: string,
    options: UseTextOptions = {},
): UseTextValue {
    const { enabled, apiKey, baseUrl, signal, ...textOptions } = options;
    const requestKey = useMemo(
        () => `${prompt}\u0000${JSON.stringify(textOptions)}`,
        [prompt, textOptions],
    );
    return useGenerationResource(
        requestKey,
        { enabled, apiKey, baseUrl, signal },
        (client, requestSignal) =>
            prompt
                ? client.text(prompt, { ...textOptions, signal: requestSignal })
                : null,
    );
}

// ============================================================================
// Audio
// ============================================================================

export type UseAudioOptions = AudioGenerateOptions & GenerationRequestOptions;
export type UseAudioValue = GenerationValue<AudioResponseExt>;

/** Generate speech or music audio from text. */
export function useAudio(
    text: string,
    options: UseAudioOptions = {},
): UseAudioValue {
    const { enabled, apiKey, baseUrl, signal, ...audioOptions } = options;
    const requestKey = useMemo(
        () => `${text}\u0000${JSON.stringify(audioOptions)}`,
        [text, audioOptions],
    );
    return useGenerationResource(
        requestKey,
        { enabled, apiKey, baseUrl, signal },
        (client, requestSignal) =>
            text
                ? client
                      .audio(text, { ...audioOptions, signal: requestSignal })
                      .then(wrapAudioResponse)
                : null,
    );
}

// ============================================================================
// Video
// ============================================================================

export type UseVideoOptions = VideoGenerateOptions & GenerationRequestOptions;
export type UseVideoValue = GenerationValue<VideoResponseExt>;

/** Generate a video from a prompt. Video generation can take minutes. */
export function useVideo(
    prompt: string,
    options: UseVideoOptions = {},
): UseVideoValue {
    const { enabled, apiKey, baseUrl, signal, ...videoOptions } = options;
    const requestKey = useMemo(
        () => `${prompt}\u0000${JSON.stringify(videoOptions)}`,
        [prompt, videoOptions],
    );
    return useGenerationResource(
        requestKey,
        { enabled, apiKey, baseUrl, signal },
        (client, requestSignal) =>
            prompt
                ? client
                      .video(prompt, { ...videoOptions, signal: requestSignal })
                      .then(wrapVideoResponse)
                : null,
    );
}

// ============================================================================
// Chat (streaming)
// ============================================================================

/** A single chat turn held by `useChat`. */
export interface ChatMessage {
    id: string;
    role: "system" | "user" | "assistant";
    content: string;
}

export type UseChatOptions = Omit<ChatOptions, "signal" | "stream"> &
    GenerationRequestOptions & {
        /** System prompt prepended to every request. */
        systemPrompt?: string;
        /** Seed the conversation (also used by `reset`). */
        initialMessages?: ChatMessage[];
    };

export interface UseChatValue {
    /** Full conversation, updated as the assistant streams. */
    messages: ChatMessage[];
    /** Text of the most recent assistant reply (grows while streaming). */
    result: string;
    isLoading: boolean;
    error: Error | null;
    /** Append a user message and stream the assistant reply. */
    sendMessage: (content: string) => Promise<void>;
    /** Re-send the conversation and stream a fresh assistant reply. */
    regenerate: () => Promise<void>;
    /** Abort the in-flight stream, keeping the partial reply. */
    cancel: () => void;
    /** Abort and clear the conversation. */
    reset: () => void;
    setMessages: (messages: ChatMessage[]) => void;
}

function createId(): string {
    const cryptoObj = globalThis.crypto as Crypto | undefined;
    if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
        return cryptoObj.randomUUID();
    }
    return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stream chat completions with the logged-in user's key from <PolliProvider>. */
export function useChat(options: UseChatOptions = {}): UseChatValue {
    const { apiKey, logout } = useRequiredAuth();
    const {
        enabled = true,
        apiKey: apiKeyOverride,
        baseUrl = DEFAULT_GENERATION_BASE_URL,
        signal,
        systemPrompt,
        initialMessages,
        ...chatOptions
    } = options;
    const effectiveApiKey = apiKeyOverride ?? apiKey;

    const [messages, setMessagesState] = useState<ChatMessage[]>(
        () => initialMessages ?? [],
    );
    const [result, setResult] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const reqIdRef = useRef(0);
    const controllerRef = useRef<AbortController | null>(null);
    const chatOptionsRef = useRef(chatOptions);
    chatOptionsRef.current = chatOptions;
    const systemPromptRef = useRef(systemPrompt);
    systemPromptRef.current = systemPrompt;

    const setMessages = useCallback((next: ChatMessage[]) => {
        messagesRef.current = next;
        setMessagesState(next);
    }, []);

    const updateMessage = useCallback((id: string, content: string) => {
        messagesRef.current = messagesRef.current.map((message) =>
            message.id === id ? { ...message, content } : message,
        );
        setMessagesState(messagesRef.current);
    }, []);

    const cancel = useCallback(() => {
        reqIdRef.current++;
        controllerRef.current?.abort();
        controllerRef.current = null;
        setIsLoading(false);
    }, []);

    const reset = useCallback(() => {
        reqIdRef.current++;
        controllerRef.current?.abort();
        controllerRef.current = null;
        const seeded = initialMessages ?? [];
        messagesRef.current = seeded;
        setMessagesState(seeded);
        setResult("");
        setError(null);
        setIsLoading(false);
    }, [initialMessages]);

    const stream = useCallback(
        async (history: ChatMessage[], assistantId: string) => {
            const reqId = ++reqIdRef.current;
            controllerRef.current?.abort();

            if (!enabled || !effectiveApiKey) {
                controllerRef.current = null;
                return;
            }

            const controller = new AbortController();
            controllerRef.current = controller;
            if (signal) {
                if (signal.aborted) {
                    controller.abort();
                } else {
                    signal.addEventListener("abort", () => controller.abort(), {
                        once: true,
                    });
                }
            }

            setIsLoading(true);
            setError(null);
            setResult("");
            try {
                const client = new Pollinations({
                    apiKey: effectiveApiKey,
                    baseUrl,
                });
                const wire: Message[] = [
                    ...(systemPromptRef.current
                        ? [
                              {
                                  role: "system" as const,
                                  content: systemPromptRef.current,
                              },
                          ]
                        : []),
                    ...history.map((message) => ({
                        role: message.role,
                        content: message.content,
                    })),
                ];
                let accumulated = "";
                for await (const chunk of client.chatStream(wire, {
                    ...chatOptionsRef.current,
                    signal: controller.signal,
                })) {
                    if (reqId !== reqIdRef.current) return;
                    const delta = chunk.choices[0]?.delta?.content;
                    if (!delta) continue;
                    accumulated += delta;
                    setResult(accumulated);
                    updateMessage(assistantId, accumulated);
                }
            } catch (err) {
                if (reqId !== reqIdRef.current) return;
                if (isCancellation(err)) return;
                if (err instanceof PollinationsError && err.status === 401) {
                    logout();
                    return;
                }
                setError(toError(err));
            } finally {
                if (reqId === reqIdRef.current) setIsLoading(false);
            }
        },
        [enabled, effectiveApiKey, baseUrl, signal, logout, updateMessage],
    );

    const sendMessage = useCallback(
        async (content: string) => {
            const trimmed = content.trim();
            if (!trimmed) return;
            const userMessage: ChatMessage = {
                id: createId(),
                role: "user",
                content: trimmed,
            };
            const assistantId = createId();
            const history = [...messagesRef.current, userMessage];
            messagesRef.current = [
                ...history,
                { id: assistantId, role: "assistant", content: "" },
            ];
            setMessagesState(messagesRef.current);
            await stream(history, assistantId);
        },
        [stream],
    );

    const regenerate = useCallback(async () => {
        const history = [...messagesRef.current];
        while (
            history.length > 0 &&
            history[history.length - 1].role === "assistant"
        ) {
            history.pop();
        }
        if (history.length === 0) return;
        const assistantId = createId();
        messagesRef.current = [
            ...history,
            { id: assistantId, role: "assistant", content: "" },
        ];
        setMessagesState(messagesRef.current);
        await stream(history, assistantId);
    }, [stream]);

    return useMemo(
        () => ({
            messages,
            result,
            isLoading,
            error,
            sendMessage,
            regenerate,
            cancel,
            reset,
            setMessages,
        }),
        [
            messages,
            result,
            isLoading,
            error,
            sendMessage,
            regenerate,
            cancel,
            reset,
            setMessages,
        ],
    );
}
