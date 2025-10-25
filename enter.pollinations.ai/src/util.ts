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
