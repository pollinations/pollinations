/**
 * Minimal gen.pollinations.ai chat client for the evals.
 *
 * The evals must not skip or hide a failing model, so every failure mode is
 * reported as a status instead of throwing: `timeout`, `rate_limited` and plain
 * `error` all count as a wrong answer in the leaderboard, with the reason kept
 * for the run log and the website.
 */

import {
    DEFAULT_BASE_URL,
    type FetchLike,
    type TokenUsage,
} from "./catalog.mts";

export type ChatStatus = "ok" | "error" | "timeout" | "rate_limited";

export type ChatOutcome = {
    status: ChatStatus;
    httpStatus: number | null;
    text: string;
    finishReason: string | null;
    usage: TokenUsage | null;
    /** Model name from the response body, when the gateway filled it in. */
    reportedModel: string | null;
    /** Model the gateway says it actually used (response header). */
    effectiveModel: string | null;
    latencyMs: number;
    attempts: number;
    errorMessage: string | null;
};

export type ChatRequest = {
    apiKey: string;
    model: string;
    prompt: string;
    /** Part of the request body, so every run and every model gets its own cache entry. */
    seed: number;
    baseUrl?: string;
    maxTokens?: number | null;
    tokenLimitParameter?: "max_tokens" | "max_completion_tokens" | null;
    timeoutMs?: number;
    maxAttempts?: number;
    fetchImpl?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    now?: () => number;
};

export const DEFAULT_TIMEOUT_MS = 90000;
export const DEFAULT_MAX_ATTEMPTS = 3;

const RETRY_BASE_MS = 2000;
const RETRY_FACTOR = 3;
const MAX_RETRY_MS = 60000;
const TIMEOUT_ATTEMPT_LIMIT = 2;

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractText(payload: unknown): string {
    if (typeof payload !== "object" || payload === null) {
        return "";
    }
    const choices = (payload as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        return "";
    }
    const choice = choices[0] as { message?: unknown } | undefined;
    const message = choice?.message;
    if (typeof message !== "object" || message === null) {
        return "";
    }
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string") {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === "string") {
                    return part;
                }
                if (
                    typeof part === "object" &&
                    part !== null &&
                    typeof (part as { text?: unknown }).text === "string"
                ) {
                    return String((part as { text?: unknown }).text);
                }
                return "";
            })
            .join("");
    }
    return "";
}

export function extractFinishReason(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) {
        return null;
    }
    const choices = (payload as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        return null;
    }
    const finishReason = (choices[0] as { finish_reason?: unknown })
        .finish_reason;
    return typeof finishReason === "string" ? finishReason : null;
}

export function extractReportedModel(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) {
        return null;
    }
    const model = (payload as { model?: unknown }).model;
    return typeof model === "string" && model.length > 0 ? model : null;
}

function headerNumber(
    headers: Headers | undefined,
    name: string,
): number | null {
    const raw = headers?.get(name);
    if (!raw) {
        return null;
    }
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
}

export function extractUsage(
    payload: unknown,
    headers?: Headers,
): TokenUsage | null {
    const usage =
        typeof payload === "object" && payload !== null
            ? (payload as { usage?: unknown }).usage
            : undefined;
    const record =
        typeof usage === "object" && usage !== null
            ? (usage as Record<string, unknown>)
            : {};
    const prompt =
        typeof record.prompt_tokens === "number"
            ? record.prompt_tokens
            : headerNumber(headers, "x-usage-prompt-text-tokens");
    const completion =
        typeof record.completion_tokens === "number"
            ? record.completion_tokens
            : headerNumber(headers, "x-usage-completion-text-tokens");
    if (prompt === null && completion === null) {
        return null;
    }
    return { prompt: prompt ?? 0, completion: completion ?? 0 };
}

function extractErrorMessage(payload: unknown, fallback: string): string {
    if (typeof payload === "object" && payload !== null) {
        const record = payload as Record<string, unknown>;
        const error = record.error;
        if (typeof error === "string" && error.length > 0) {
            return error;
        }
        if (typeof error === "object" && error !== null) {
            const message = (error as { message?: unknown }).message;
            if (typeof message === "string" && message.length > 0) {
                return message;
            }
        }
        if (typeof record.message === "string" && record.message.length > 0) {
            return record.message;
        }
    }
    return fallback;
}

function retryDelayMs(
    response: Response | null,
    attempt: number,
    random: () => number,
): number {
    const retryAfter = response
        ? Number.parseFloat(response.headers.get("retry-after") ?? "")
        : Number.NaN;
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
        return Math.min(retryAfter * 1000, MAX_RETRY_MS);
    }
    return (
        Math.min(RETRY_BASE_MS * RETRY_FACTOR ** (attempt - 1), MAX_RETRY_MS) +
        Math.floor(random() * 500)
    );
}

export async function requestChat(request: ChatRequest): Promise<ChatOutcome> {
    const baseUrl = request.baseUrl ?? DEFAULT_BASE_URL;
    const fetchImpl = request.fetchImpl ?? fetch;
    const sleep = request.sleep ?? defaultSleep;
    const random = request.random ?? Math.random;
    const now = request.now ?? Date.now;
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxAttempts = Math.max(
        1,
        request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    );

    const body: Record<string, unknown> = {
        model: request.model,
        messages: [{ role: "user", content: request.prompt }],
        seed: request.seed,
    };
    if (request.tokenLimitParameter && request.maxTokens) {
        body[request.tokenLimitParameter] = request.maxTokens;
    }

    const startedAt = now();
    let attempts = 0;
    let rateLimited = false;
    let httpStatus: number | null = null;
    let errorMessage: string | null = null;

    while (attempts < maxAttempts) {
        attempts += 1;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${request.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const latencyMs = now() - startedAt;
            httpStatus = response.status;

            if (response.status === 429) {
                rateLimited = true;
                errorMessage = "rate limited (429)";
                if (attempts < maxAttempts) {
                    await sleep(retryDelayMs(response, attempts, random));
                    continue;
                }
                return {
                    status: "rate_limited",
                    httpStatus,
                    text: "",
                    finishReason: null,
                    usage: null,
                    reportedModel: null,
                    effectiveModel: response.headers.get("x-model-used"),
                    latencyMs,
                    attempts,
                    errorMessage,
                };
            }

            if (response.status >= 500) {
                errorMessage = `HTTP ${response.status}`;
                if (attempts < maxAttempts) {
                    await sleep(retryDelayMs(response, attempts, random));
                    continue;
                }
                return {
                    status: "error",
                    httpStatus,
                    text: "",
                    finishReason: null,
                    usage: null,
                    reportedModel: null,
                    effectiveModel: response.headers.get("x-model-used"),
                    latencyMs,
                    attempts,
                    errorMessage,
                };
            }

            const payload: unknown = await response.json().catch(() => null);
            if (!response.ok) {
                return {
                    status: "error",
                    httpStatus,
                    text: "",
                    finishReason: null,
                    usage: extractUsage(payload, response.headers),
                    reportedModel: extractReportedModel(payload),
                    effectiveModel: response.headers.get("x-model-used"),
                    latencyMs,
                    attempts,
                    errorMessage: extractErrorMessage(
                        payload,
                        `HTTP ${response.status}`,
                    ),
                };
            }
            return {
                status: "ok",
                httpStatus,
                text: extractText(payload),
                finishReason: extractFinishReason(payload),
                usage: extractUsage(payload, response.headers),
                reportedModel: extractReportedModel(payload),
                effectiveModel: response.headers.get("x-model-used"),
                latencyMs,
                attempts,
                errorMessage: null,
            };
        } catch (error) {
            const aborted = controller.signal.aborted;
            const latencyMs = now() - startedAt;
            errorMessage = aborted
                ? `request timed out after ${timeoutMs}ms`
                : `${(error as Error).name}: ${(error as Error).message}`;
            const canRetry = aborted
                ? attempts < Math.min(maxAttempts, TIMEOUT_ATTEMPT_LIMIT)
                : attempts < maxAttempts;
            if (canRetry) {
                await sleep(retryDelayMs(null, attempts, random));
                continue;
            }
            return {
                status: aborted ? "timeout" : "error",
                httpStatus,
                text: "",
                finishReason: null,
                usage: null,
                reportedModel: null,
                effectiveModel: null,
                latencyMs,
                attempts,
                errorMessage,
            };
        } finally {
            clearTimeout(timer);
        }
    }

    return {
        status: rateLimited ? "rate_limited" : "error",
        httpStatus,
        text: "",
        finishReason: null,
        usage: null,
        reportedModel: null,
        effectiveModel: null,
        latencyMs: now() - startedAt,
        attempts,
        errorMessage: errorMessage ?? "no attempt was made",
    };
}

/**
 * Account balance in Pollen, straight from the gen API.
 *
 * Used to print the real cost of a run next to the estimate: before/after
 * balances are ground truth, the per-request token math is a lower bound when a
 * model has no published price. The dashboard host only answers session
 * requests, so this one talks to the same host as the generations.
 */
export async function fetchAccountBalance(options: {
    apiKey: string;
    baseUrl?: string;
    fetchImpl?: FetchLike;
}): Promise<number | null> {
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const fetchImpl = options.fetchImpl ?? fetch;
    try {
        const response = await fetchImpl(`${baseUrl}/account/balance`, {
            headers: { Authorization: `Bearer ${options.apiKey}` },
        });
        if (!response.ok) {
            return null;
        }
        const payload: unknown = await response.json();
        if (typeof payload !== "object" || payload === null) {
            return null;
        }
        const balance = (payload as { balance?: unknown }).balance;
        const parsed = typeof balance === "string" ? Number(balance) : balance;
        return typeof parsed === "number" && Number.isFinite(parsed)
            ? parsed
            : null;
    } catch {
        return null;
    }
}
