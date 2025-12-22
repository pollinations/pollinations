import { clsx } from "clsx/lite";
import { customAlphabet } from "nanoid";
import { twMerge } from "tailwind-merge";

const generateUniqueId = customAlphabet(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
);

export const generateRandomId = () => generateUniqueId(32);

// Helper function to merge Tailwind classes safely
export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(...inputs));
}

export function* batches<T>(
    array: T[],
    size: number,
): Generator<T[], void, void> {
    for (let i = 0; i < array.length; i += size) {
        yield array.slice(i, i + size);
    }
}

export function omit<T, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
    const result = { ...obj };
    keys.forEach((key) => delete result[key]);
    return result;
}

type NonNullable<T> = T extends null | undefined ? never : T;

type RemoveUnset<T> = {
    [K in keyof T as T[K] extends null | undefined ? never : K]: NonNullable<
        T[K]
    >;
};

export function removeUnset<T extends Record<string, any>>(
    obj: T,
): RemoveUnset<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(
            ([_, value]) => value !== null && value !== undefined,
        ),
    ) as RemoveUnset<T>;
}

export function joinOptionalStrings(
    separator: string,
    ...strings: (string | null | undefined)[]
): string {
    return removeUnset(strings).join(separator);
}

const resetColor = "\x1b[0m";

export type AnsiColor =
    | "black"
    | "red"
    | "green"
    | "yellow"
    | "blue"
    | "magenta"
    | "cyan"
    | "white";

const ansiColors: Record<AnsiColor, string> = {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
};

export type AnsiStyle =
    | "bold"
    | "dim"
    | "italic"
    | "underline"
    | "strikethrough";

const ansiStyles: Record<AnsiStyle, string> = {
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    italic: "\x1b[3m",
    underline: "\x1b[4m",
    strikethrough: "\x1b[9m",
};

export function applyColor(color: AnsiColor, str: string): string {
    return `${ansiColors[color]}${str}${resetColor}`;
}

export function applyStyle(style: AnsiStyle, str: string): string {
    return `${ansiStyles[style]}${str}${resetColor}`;
}

export function lines(...lines: string[]): string {
    return lines.join("\n");
}

export function capitalize(str: string) {
    return `${str.charAt(0).toUpperCase()}${str.slice(1)}`;
}

export function safeRound(amount: number, precision: number = 6): number {
    if (!isFinite(amount) || isNaN(amount)) {
        return 0;
    }
    // Handle very small amounts (avoid floating point issues)
    if (Math.abs(amount) < Math.pow(10, -(precision + 2))) {
        return 0;
    }
    const factor = Math.pow(10, precision);
    return Math.round(amount * factor) / factor;
}

export type ExponentialBackoffOptions = {
    maxAttempts?: number;
    minDelay?: number;
    maxDelay?: number;
    jitter?: number; // 0 to 1 (e.g., 0.25 = ±25%)
};

export function exponentialBackoffDelay(
    attempt: number,
    options: ExponentialBackoffOptions = {},
): number {
    const {
        minDelay = 100,
        maxDelay = 10000,
        maxAttempts = 5,
        jitter = 0.25,
    } = options;

    if (attempt === 0) return 0;

    const base = Math.pow(maxDelay / minDelay, 1 / (maxAttempts - 1));
    const delay = minDelay * Math.pow(base, attempt - 1);

    if (jitter > 0) {
        const jitterRange = delay * jitter;
        const jitterOffset = jitterRange * (Math.random() * 2 - 1);
        return delay + jitterOffset;
    }

    // return clamped delay
    return Math.max(minDelay, Math.min(maxDelay, delay));
}

export type RetryOptions = {
    maxAttempts?: number;
    minDelay?: number;
    maxDelay?: number;
    jitter?: number;
    onRetry?: (
        error: Error,
        attempt: number,
        delay: number,
    ) => void | Promise<void>;
    shouldRetry?: (error: Error, attempt: number) => boolean;
};

export async function withRetry<T extends (...args: any[]) => any>(
    fn: T,
    options: RetryOptions = {},
): Promise<Awaited<ReturnType<T>>> {
    const {
        maxAttempts = 5,
        minDelay = 100,
        maxDelay = 10000,
        jitter = 0.25,
        onRetry,
        shouldRetry = () => true,
    } = options;

    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt < maxAttempts) {
        try {
            attempt += 1;
            return await fn();
        } catch (error) {
            lastError =
                error instanceof Error ? error : new Error(String(error));

            if (attempt >= maxAttempts || !shouldRetry(lastError, attempt)) {
                // This was the last attempt or the error was deemed unretryable
                break;
            }

            const delay = exponentialBackoffDelay(attempt, {
                minDelay,
                maxDelay,
                maxAttempts,
                jitter,
            });

            await onRetry?.(lastError, attempt, delay);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    // All attempts failed
    throw lastError;
}
