import type { Context } from "hono";
import { routePath } from "hono/route";

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

export function capitalize(str: string): string {
    return `${str.charAt(0).toUpperCase()}${str.slice(1)}`;
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
