/**
 * Tiny CLI argument helpers shared across pipeline scripts.
 */

/** Get a string flag value from argv, e.g. getString(args, "--emails-file") */
export function getString(
    args: string[],
    flag: string,
    fallback?: string,
): string | undefined {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

/** Get a numeric flag value from argv, e.g. getNumber(args, "--limit", 1000) */
export function getNumber(
    args: string[],
    flag: string,
    fallback?: number,
): number | undefined {
    const value = getString(args, flag);
    if (!value) return fallback;
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

/** Check if a boolean flag is present */
export function hasFlag(args: string[], flag: string): boolean {
    return args.includes(flag);
}
