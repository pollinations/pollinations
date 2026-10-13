import { useCallback, useMemo, useRef, useState } from "react";
import { Pollinations } from "../client.js";
import type {
    AudioBinaryResponse,
    AudioGenerateOptions,
    ImageGenerateOptions,
    ImageResponse,
    TextGenerateOptions,
    VideoGenerateOptions,
    VideoResponse,
} from "../types.js";
import { PollinationsError } from "../types.js";
import { useRequiredAuth } from "./hooks.js";

export interface GenerationValue<T> {
    result: T | null;
    isLoading: boolean;
    error: Error | null;
    run: (...args: unknown[]) => Promise<T | null>;
    rerun: () => Promise<T | null>;
    cancel: () => void;
}

type GenerationRunner<T> = (
    client: Pollinations,
    signal: AbortSignal,
    ...args: never[]
) => Promise<T>;

function useGeneration<T>(runner: GenerationRunner<T>): GenerationValue<T> {
    const { apiKey, logout } = useRequiredAuth();
    const [result, setResult] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const argsRef = useRef<unknown[] | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const runnerRef = useRef(runner);
    runnerRef.current = runner;

    const cancel = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setIsLoading(false);
    }, []);

    const run = useCallback(
        async (...args: unknown[]): Promise<T | null> => {
            if (!apiKey) {
                setError(
                    new Error(
                        "A Pollinations API key is required. Use <PolliProvider> or pass apiKey.",
                    ),
                );
                return null;
            }
            argsRef.current = args;
            controllerRef.current?.abort();
            const controller = new AbortController();
            controllerRef.current = controller;
            setIsLoading(true);
            setError(null);
            try {
                const client = new Pollinations({ apiKey });
                const value = await runnerRef.current(
                    client,
                    controller.signal,
                    ...(args as never[]),
                );
                if (controller.signal.aborted) return null;
                setResult(value);
                return value;
            } catch (err) {
                if (controller.signal.aborted) return null;
                if (err instanceof PollinationsError && err.status === 401) {
                    logout();
                    return null;
                }
                setError(err instanceof Error ? err : new Error(String(err)));
                return null;
            } finally {
                if (controllerRef.current === controller) {
                    setIsLoading(false);
                    controllerRef.current = null;
                }
            }
        },
        [apiKey, logout],
    );

    const rerun = useCallback(async (): Promise<T | null> => {
        const args = argsRef.current;
        if (!args) return null;
        return run(...args);
    }, [run]);

    // Abort in-flight request when the key changes or on unmount.
    const apiKeyRef = useRef(apiKey);
    apiKeyRef.current = apiKey;
    useMemo(() => {
        if (apiKeyRef.current !== apiKey) {
            controllerRef.current?.abort();
        }
    }, [apiKey]);

    // Clear state on logout.
    useMemo(() => {
        if (!apiKey) {
            setResult(null);
            setError(null);
            setIsLoading(false);
        }
    }, [apiKey]);

    return useMemo(
        () => ({ result, isLoading, error, run, rerun, cancel }),
        [result, isLoading, error, run, rerun, cancel],
    );
}

/** Generate an image from a text prompt. */
export function useImage(): GenerationValue<ImageResponse> {
    return useGeneration<ImageResponse>(
        (
            client: Pollinations,
            signal: AbortSignal,
            prompt: string,
            options?: ImageGenerateOptions,
        ) => client.image(prompt, { ...options, signal }),
    );
}

/** Generate a video from a text prompt. */
export function useVideo(): GenerationValue<VideoResponse> {
    return useGeneration<VideoResponse>(
        (
            client: Pollinations,
            signal: AbortSignal,
            prompt: string,
            options?: VideoGenerateOptions,
        ) => client.video(prompt, { ...options, signal }),
    );
}

/** Generate text from a prompt. Returns the generated string. */
export function useText(): GenerationValue<string> {
    return useGeneration<string>(
        (
            client: Pollinations,
            signal: AbortSignal,
            prompt: string,
            options?: TextGenerateOptions,
        ) => client.text(prompt, { ...options, signal }),
    );
}

/** Generate audio (speech/music) from text. */
export function useAudio(): GenerationValue<AudioBinaryResponse> {
    return useGeneration<AudioBinaryResponse>(
        (
            client: Pollinations,
            signal: AbortSignal,
            text: string,
            options?: AudioGenerateOptions,
        ) => client.audio(text, { ...options, signal }),
    );
}
