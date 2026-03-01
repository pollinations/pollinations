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

export function applyColor(color: AnsiColor, str: string): string {
    return `${ansiColors[color]}${str}${resetColor}`;
}

export function capitalize(str: string) {
    return `${str.charAt(0).toUpperCase()}${str.slice(1)}`;
}

export function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
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

