import {
    isPortkeyRequestTimeout,
    isRetryableFallbackError,
} from "../fallback.ts";
import { findModelByName } from "./availableModels.js";
import type { ServiceError } from "./types.js";

export const TEXT_RESPONSE_BUDGET_MS = 290_000;

export type TextAttemptBudget = {
    timeoutMs: number;
    fetcher: (base?: typeof fetch) => typeof fetch;
};

/** One response deadline shared by a text model's declared fallback attempts. */
export function createTextAttemptBudget(modelId: string | undefined) {
    const primaryBudget = modelId
        ? findModelByName(modelId)?.fallbackAfterMs
        : undefined;
    const deadline = Date.now() + TEXT_RESPONSE_BUDGET_MS;
    const timeouts = new WeakMap<Error, boolean>();

    return {
        shouldFallback(error: unknown) {
            return error instanceof Error && timeouts.has(error)
                ? !timeouts.get(error)
                : isRetryableFallbackError(error);
        },
        async run<T>(
            candidateId: string,
            operation: (budget?: TextAttemptBudget) => Promise<T>,
        ): Promise<T> {
            if (primaryBudget === undefined) return operation();
            const remaining = deadline - Date.now();
            const timeoutMs = Math.min(
                candidateId === modelId ? primaryBudget : remaining,
                remaining,
            );
            const attemptDeadline = Date.now() + timeoutMs;
            const controller = new AbortController();
            const timeoutError = Object.assign(
                new Error(
                    timeoutMs < remaining
                        ? `Text provider exceeded its ${timeoutMs}ms response budget`
                        : "Text generation exceeded its shared 290000ms response deadline",
                ),
                { status: 504, upstreamStatus: 408 },
            ) as ServiceError;
            const expire = () => {
                timeouts.set(
                    timeoutError,
                    timeoutMs >= remaining || Date.now() >= deadline,
                );
                controller.abort(timeoutError);
                return timeoutError;
            };
            if (remaining <= 0) throw expire();
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                return await Promise.race([
                    operation({
                        get timeoutMs() {
                            return Math.max(1, attemptDeadline - Date.now());
                        },
                        fetcher:
                            (base = fetch) =>
                            (input, init) => {
                                timeoutError.requestUrl = new URL(
                                    input instanceof Request
                                        ? input.url
                                        : String(input),
                                );
                                const left = attemptDeadline - Date.now();
                                if (left <= 0) throw expire();
                                const request =
                                    input instanceof Request
                                        ? input
                                        : undefined;
                                const headers = new Headers(
                                    init?.headers ?? request?.headers,
                                );
                                if (headers.has("x-portkey-request-timeout")) {
                                    headers.set(
                                        "x-portkey-request-timeout",
                                        String(left),
                                    );
                                }
                                const signal = init?.signal ?? request?.signal;
                                return base(input, {
                                    ...init,
                                    headers,
                                    signal: signal
                                        ? AbortSignal.any([
                                              signal,
                                              controller.signal,
                                          ])
                                        : controller.signal,
                                });
                            },
                    }),
                    new Promise<never>((_, reject) => {
                        timer = setTimeout(
                            () => reject(expire()),
                            Math.max(0, attemptDeadline - Date.now()),
                        );
                    }),
                ]);
            } catch (error) {
                // Portkey can enforce the supplied attempt budget before our timer.
                if (error instanceof Error && isPortkeyRequestTimeout(error)) {
                    timeouts.set(
                        error,
                        timeoutMs >= remaining || Date.now() >= deadline,
                    );
                }
                throw error;
            } finally {
                // An accepted stream owns its lifetime; never restart or abort it.
                clearTimeout(timer);
            }
        },
    };
}
