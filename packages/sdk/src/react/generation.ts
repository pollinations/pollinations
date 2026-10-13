import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pollinations } from "../client.js";
import type {
    AudioBinaryResponse,
    AudioGenerateOptions,
    ChatOptions,
    ChatResponse,
    ImageGenerateOptions,
    ImageResponse,
    Message,
    TextGenerateOptions,
    TranscribeOptions,
    TranscriptionResponse,
    VideoGenerateOptions,
    VideoResponse,
} from "../types.js";
import { PollinationsError } from "../types.js";
import { useAuth } from "./hooks.js";

export interface GenerationOptions {
    /** Generation API base URL. Defaults to https://gen.pollinations.ai. */
    baseUrl?: string;
}

export interface GenerationValue<A extends unknown[], T> {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
    /** Start a request. A new call cancels the one in flight. */
    run: (...args: A) => Promise<T | null>;
    /** Run again with the last arguments. */
    rerun: () => Promise<T | null>;
    /** Abort the request in flight. Keeps the last result. */
    cancel: () => void;
}

type Generate<A extends unknown[], T> = (
    client: Pollinations,
    signal: AbortSignal,
    ...args: A
) => Promise<T>;

/**
 * Request state for one Pollinations call made with the provider's key.
 * Nothing is sent until `run` is called. Changing or clearing the key aborts
 * the request in flight and clears the result.
 */
export function useGeneration<A extends unknown[], T>(
    generate: Generate<A, T>,
    { baseUrl }: GenerationOptions = {},
): GenerationValue<A, T> {
    const { apiKey, logout } = useAuth();
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const argsRef = useRef<A | null>(null);
    const generateRef = useRef(generate);
    generateRef.current = generate;

    const cancel = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setIsLoading(false);
    }, []);

    useEffect(() => {
        setData(null);
        setError(null);
        argsRef.current = null;
        return cancel;
    }, [apiKey, baseUrl, cancel]);

    const run = useCallback(
        async (...args: A) => {
            controllerRef.current?.abort();
            argsRef.current = args;
            if (!apiKey) {
                controllerRef.current = null;
                setIsLoading(false);
                setError(new Error("Log in to Pollinations first"));
                return null;
            }
            const controller = new AbortController();
            controllerRef.current = controller;
            setIsLoading(true);
            setError(null);
            try {
                const client = new Pollinations({ apiKey, baseUrl });
                const result = await generateRef.current(
                    client,
                    controller.signal,
                    ...args,
                );
                if (controller.signal.aborted) return null;
                setData(result);
                return result;
            } catch (err) {
                if (controller.signal.aborted) return null;
                if (err instanceof PollinationsError && err.status === 401) {
                    logout();
                }
                setError(err instanceof Error ? err : new Error(String(err)));
                return null;
            } finally {
                if (controllerRef.current === controller) {
                    controllerRef.current = null;
                    setIsLoading(false);
                }
            }
        },
        [apiKey, baseUrl, logout],
    );

    const rerun = useCallback(
        () =>
            argsRef.current ? run(...argsRef.current) : Promise.resolve(null),
        [run],
    );

    return useMemo(
        () => ({ data, isLoading, error, run, rerun, cancel }),
        [data, isLoading, error, run, rerun, cancel],
    );
}

export type UseImageValue = GenerationValue<
    [prompt: string, options?: ImageGenerateOptions],
    ImageResponse
>;
export type UseTextValue = GenerationValue<
    [prompt: string, options?: TextGenerateOptions],
    string
>;
export type UseChatCompletionValue = GenerationValue<
    [messages: Message[], options?: Omit<ChatOptions, "stream">],
    ChatResponse
>;
export type UseAudioValue = GenerationValue<
    [text: string, options?: AudioGenerateOptions],
    AudioBinaryResponse
>;
export type UseVideoValue = GenerationValue<
    [prompt: string, options?: VideoGenerateOptions],
    VideoResponse
>;
export type UseTranscriptionValue = GenerationValue<
    [audio: ArrayBuffer | Blob, options?: TranscribeOptions],
    TranscriptionResponse
>;

/** Image bytes: `run(prompt, options)`. */
export function useImage(options?: GenerationOptions): UseImageValue {
    return useGeneration(
        (client, signal, prompt: string, opts?: ImageGenerateOptions) =>
            client.image(prompt, { ...opts, signal }),
        options,
    );
}

/** Text from a prompt: `run(prompt, options)`. */
export function useText(options?: GenerationOptions): UseTextValue {
    return useGeneration(
        (client, signal, prompt: string, opts?: TextGenerateOptions) =>
            client.text(prompt, { ...opts, signal }),
        options,
    );
}

/** A full chat completion: `run(messages, options)`. */
export function useChatCompletion(
    options?: GenerationOptions,
): UseChatCompletionValue {
    return useGeneration(
        (
            client,
            signal,
            messages: Message[],
            opts?: Omit<ChatOptions, "stream">,
        ) => client.chat(messages, { ...opts, signal }),
        options,
    );
}

/** Speech or music bytes: `run(text, options)`. */
export function useAudio(options?: GenerationOptions): UseAudioValue {
    return useGeneration(
        (client, signal, text: string, opts?: AudioGenerateOptions) =>
            client.audio(text, { ...opts, signal }),
        options,
    );
}

/** Video bytes: `run(prompt, options)`. */
export function useVideo(options?: GenerationOptions): UseVideoValue {
    return useGeneration(
        (client, signal, prompt: string, opts?: VideoGenerateOptions) =>
            client.video(prompt, { ...opts, signal }),
        options,
    );
}

/** Speech to text: `run(audio, options)`. */
export function useTranscription(
    options?: GenerationOptions,
): UseTranscriptionValue {
    return useGeneration(
        (client, signal, audio: ArrayBuffer | Blob, opts?: TranscribeOptions) =>
            client.transcribe(audio, { ...opts, signal }),
        options,
    );
}
