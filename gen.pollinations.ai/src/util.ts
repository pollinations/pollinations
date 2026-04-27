import type { Context } from "hono";
import { routePath } from "hono/route";

const RANDOM_ID_ALPHABET =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const resetColor = "\x1b[0m";

export function generateRandomId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(
        bytes,
        (byte) => RANDOM_ID_ALPHABET[byte % RANDOM_ID_ALPHABET.length],
    ).join("");
}

export function getRoutePath(c: Context): string {
    try {
        return routePath(c) || c.req.path;
    } catch {
        return c.req.path;
    }
}

type NonNullableValue<T> = T extends null | undefined ? never : T;

type RemoveUnset<T> = {
    [K in keyof T as T[K] extends null | undefined
        ? never
        : K]: NonNullableValue<T[K]>;
};

export function removeUnset<T extends object>(obj: T): RemoveUnset<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(
            ([_, value]) => value !== null && value !== undefined,
        ),
    ) as RemoveUnset<T>;
}

export function safeRound(amount: number, precision: number = 6): number {
    if (!Number.isFinite(amount) || Number.isNaN(amount)) {
        return 0;
    }
    if (Math.abs(amount) < 10 ** -(precision + 2)) {
        return 0;
    }
    const factor = 10 ** precision;
    return Math.round(amount * factor) / factor;
}

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
