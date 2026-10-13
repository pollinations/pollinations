import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Pollinations } from "../client.js";
import type {
    AudioBinaryResponse,
    AudioGenerateOptions,
    ChatOptions,
    ImageGenerateOptions,
    ImageResponse,
    Message,
    TextGenerateOptions,
    VideoGenerateOptions,
    VideoResponse,
} from "../types.js";
import { AuthContext } from "./contexts.js";

const DEFAULT_GEN_URL = "https://gen.pollinations.ai";

function useGenClient(genUrl?: string): Pollinations | null {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error(
            "Pollinations generation hooks must be used within a <PolliProvider>",
        );
    }
    const baseUrl = genUrl ?? DEFAULT_GEN_URL;
    return useMemo(
        () =>
            ctx.apiKey
                ? new Pollinations({ apiKey: ctx.apiKey, baseUrl })
                : null,
        [ctx.apiKey, baseUrl],
    );
}

export interface GenerationValue<TArg, TData> {
    data: TData | null;
    isLoading: boolean;
    error: Error | null;
    /** Start a run; calling it again re-runs and supersedes the previous run. */
    run: (
        input: TArg,
        options?: { signal?: AbortSignal },
    ) => Promise<TData | null>;
    /** Cancel the in-flight run. Cancelled runs set loading false and no error. */
    cancel: () => void;
    /** Clear result and error. */
    reset: () => void;
}

type Invoke<TArg, TData> = (
    client: Pollinations,
    input: TArg,
    signal: AbortSignal,
) => Promise<TData>;

function useGeneration<TArg, TData>(
    invoke: Invoke<TArg, TData>,
    options: { genUrl?: string } = {},
): GenerationValue<TArg, TData> {
    const client = useGenClient(options.genUrl);
    const [data, setData] = useState<TData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const reqIdRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    // New client (key rotation / login / logout): the old key's run can never
    // land. Abort it, invalidate it, stop loading. On logout also clear owned
    // state so a new user never sees the old result.
    useEffect(() => {
        reqIdRef.current++;
        abortRef.current?.abort();
        abortRef.current = null;
        setIsLoading(false);
        if (!client) {
            setData(null);
            setError(null);
        }
    }, [client]);

    const cancel = useCallback(() => {
        reqIdRef.current++;
        abortRef.current?.abort();
        abortRef.current = null;
        setIsLoading(false);
    }, []);

    const reset = useCallback(() => {
        reqIdRef.current++;
        abortRef.current?.abort();
        abortRef.current = null;
        setData(null);
        setIsLoading(false);
        setError(null);
    }, []);

    const run = useCallback(
        async (
            input: TArg,
            runOptions: { signal?: AbortSignal } = {},
        ): Promise<TData | null> => {
            const reqId = ++reqIdRef.current;
            const active = client;
            if (!active) {
                setData(null);
                setIsLoading(false);
                setError(
                    new Error(
                        "Not logged in: generation hooks need a Pollen key from <PolliProvider> (login first).",
                    ),
                );
                return null;
            }
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            const onExternalAbort = () => controller.abort();
            runOptions.signal?.addEventListener("abort", onExternalAbort, {
                once: true,
            });
            setIsLoading(true);
            setError(null);
            try {
                const result = await invoke(active, input, controller.signal);
                if (reqId !== reqIdRef.current) return null;
                setData(result);
                return result;
            } catch (err) {
                if (reqId !== reqIdRef.current) return null;
                // Cancelled runs are quiet: loading stops, no error, old data kept.
                if (controller.signal.aborted) {
                    setIsLoading(false);
                    return null;
                }
                setData(null);
                setError(err instanceof Error ? err : new Error(String(err)));
                return null;
            } finally {
                runOptions.signal?.removeEventListener(
                    "abort",
                    onExternalAbort,
                );
                if (reqId === reqIdRef.current) {
                    abortRef.current = null;
                    setIsLoading(false);
                }
            }
        },
        [client, invoke],
    );

    return useMemo(
        () => ({ data, isLoading, error, run, cancel, reset }),
        [data, isLoading, error, run, cancel, reset],
    );
}

export interface ImageRunInput {
    prompt: string;
    options?: ImageGenerateOptions;
}

/** Generate an image; result holds the bytes, content type and keyless URL. */
export function useImage(options: { genUrl?: string } = {}): Omit<
    GenerationValue<ImageRunInput, ImageResponse>,
    "run"
> & {
    run: (
        prompt: string,
        runOptions?: ImageGenerateOptions & { signal?: AbortSignal },
    ) => Promise<ImageResponse | null>;
} {
    const invoke = useCallback<Invoke<ImageRunInput, ImageResponse>>(
        (client, input, signal) =>
            client.image(input.prompt, { ...input.options, signal }),
        [],
    );
    const gen = useGeneration(invoke, options);
    const run = useCallback(
        (
            prompt: string,
            runOptions?: ImageGenerateOptions & { signal?: AbortSignal },
        ) => {
            const { signal, ...rest } = runOptions ?? {};
            return gen.run({ prompt, options: rest }, { signal });
        },
        [gen.run],
    );
    return useMemo(
        () => ({
            data: gen.data,
            isLoading: gen.isLoading,
            error: gen.error,
            run,
            cancel: gen.cancel,
            reset: gen.reset,
        }),
        [gen.data, gen.isLoading, gen.error, run, gen.cancel, gen.reset],
    );
}

export interface TextRunInput {
    prompt: string;
    options?: TextGenerateOptions;
}

/** Generate text; result is the plain string reply. */
export function useText(options: { genUrl?: string } = {}): Omit<
    GenerationValue<TextRunInput, string>,
    "run"
> & {
    run: (
        prompt: string,
        runOptions?: TextGenerateOptions & { signal?: AbortSignal },
    ) => Promise<string | null>;
} {
    const invoke = useCallback<Invoke<TextRunInput, string>>(
        (client, input, signal) =>
            client.text(input.prompt, { ...input.options, signal }),
        [],
    );
    const gen = useGeneration(invoke, options);
    const run = useCallback(
        (
            prompt: string,
            runOptions?: TextGenerateOptions & { signal?: AbortSignal },
        ) => {
            const { signal, ...rest } = runOptions ?? {};
            return gen.run({ prompt, options: rest }, { signal });
        },
        [gen.run],
    );
    return useMemo(
        () => ({
            data: gen.data,
            isLoading: gen.isLoading,
            error: gen.error,
            run,
            cancel: gen.cancel,
            reset: gen.reset,
        }),
        [gen.data, gen.isLoading, gen.error, run, gen.cancel, gen.reset],
    );
}

export interface AudioRunInput {
    text: string;
    options?: AudioGenerateOptions;
}

/** Generate speech or music; result holds the binary audio. */
export function useAudio(options: { genUrl?: string } = {}): Omit<
    GenerationValue<AudioRunInput, AudioBinaryResponse>,
    "run"
> & {
    run: (
        text: string,
        runOptions?: AudioGenerateOptions & { signal?: AbortSignal },
    ) => Promise<AudioBinaryResponse | null>;
} {
    const invoke = useCallback<Invoke<AudioRunInput, AudioBinaryResponse>>(
        (client, input, signal) =>
            client.audio(input.text, { ...input.options, signal }),
        [],
    );
    const gen = useGeneration(invoke, options);
    const run = useCallback(
        (
            text: string,
            runOptions?: AudioGenerateOptions & { signal?: AbortSignal },
        ) => {
            const { signal, ...rest } = runOptions ?? {};
            return gen.run({ text, options: rest }, { signal });
        },
        [gen.run],
    );
    return useMemo(
        () => ({
            data: gen.data,
            isLoading: gen.isLoading,
            error: gen.error,
            run,
            cancel: gen.cancel,
            reset: gen.reset,
        }),
        [gen.data, gen.isLoading, gen.error, run, gen.cancel, gen.reset],
    );
}

export interface VideoRunInput {
    prompt: string;
    options?: VideoGenerateOptions;
}

/** Generate a video; result holds the bytes, content type and keyless URL. */
export function useVideo(options: { genUrl?: string } = {}): Omit<
    GenerationValue<VideoRunInput, VideoResponse>,
    "run"
> & {
    run: (
        prompt: string,
        runOptions?: VideoGenerateOptions & { signal?: AbortSignal },
    ) => Promise<VideoResponse | null>;
} {
    const invoke = useCallback<Invoke<VideoRunInput, VideoResponse>>(
        (client, input, signal) =>
            client.video(input.prompt, { ...input.options, signal }),
        [],
    );
    const gen = useGeneration(invoke, options);
    const run = useCallback(
        (
            prompt: string,
            runOptions?: VideoGenerateOptions & { signal?: AbortSignal },
        ) => {
            const { signal, ...rest } = runOptions ?? {};
            return gen.run({ prompt, options: rest }, { signal });
        },
        [gen.run],
    );
    return useMemo(
        () => ({
            data: gen.data,
            isLoading: gen.isLoading,
            error: gen.error,
            run,
            cancel: gen.cancel,
            reset: gen.reset,
        }),
        [gen.data, gen.isLoading, gen.error, run, gen.cancel, gen.reset],
    );
}

export interface ChatStreamRunInput {
    messages: Message[];
    options?: ChatOptions;
}

/** Stream a chat; result is the accumulated reply text. */
export function useChatStream(options: { genUrl?: string } = {}): Omit<
    GenerationValue<ChatStreamRunInput, string>,
    "run"
> & {
    run: (
        messages: Message[],
        runOptions?: ChatOptions & { signal?: AbortSignal },
    ) => Promise<string | null>;
} {
    const invoke = useCallback<Invoke<ChatStreamRunInput, string>>(
        async (client, input, signal) => {
            let out = "";
            for await (const chunk of client.chatStream(input.messages, {
                ...input.options,
                signal,
            })) {
                if (signal.aborted) break;
                out += chunk.choices[0]?.delta?.content ?? "";
            }
            return out;
        },
        [],
    );
    const gen = useGeneration(invoke, options);
    const run = useCallback(
        (
            messages: Message[],
            runOptions?: ChatOptions & { signal?: AbortSignal },
        ) => {
            const { signal, ...rest } = runOptions ?? {};
            return gen.run({ messages, options: rest }, { signal });
        },
        [gen.run],
    );
    return useMemo(
        () => ({
            data: gen.data,
            isLoading: gen.isLoading,
            error: gen.error,
            run,
            cancel: gen.cancel,
            reset: gen.reset,
        }),
        [gen.data, gen.isLoading, gen.error, run, gen.cancel, gen.reset],
    );
}
