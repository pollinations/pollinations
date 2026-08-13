/**
 * Validate a CLI-supplied numeric option.
 *
 * Dimensions and durations passed via flags are strings straight from the
 * command line. Without validation they are forwarded verbatim to the API
 * (e.g. `--width abc` or `--width -5`), producing raw validation errors like
 * `Invalid input: expected number, received NaN` instead of a helpful CLI
 * message — and invalid values are never caught locally.
 *
 * Returns the normalized integer on success, or an error message on failure.
 */
export function parsePositiveInt(
    value: string | undefined,
    name: string,
    opts: { min?: number; max?: number } = {},
): { value: number } | { error: string } {
    if (value === undefined || value === "") {
        return { error: `${name} is required` };
    }
    const num = Number(value);
    if (!Number.isInteger(num)) {
        return { error: `${name} must be an integer, got "${value}"` };
    }
    if (num <= 0) {
        return { error: `${name} must be a positive integer, got "${value}"` };
    }
    if (opts.min !== undefined && num < opts.min) {
        return {
            error: `${name} must be at least ${opts.min}, got "${value}"`,
        };
    }
    if (opts.max !== undefined && num > opts.max) {
        return { error: `${name} must be at most ${opts.max}, got "${value}"` };
    }
    return { value: num };
}

/**
 * Convenience wrapper: validates `value` and, on failure, prints an error
 * and exits with code 1. Returns the validated integer.
 */
export function requirePositiveInt(
    value: string | undefined,
    name: string,
    opts: { min?: number; max?: number } = {},
    printError: (msg: string) => void = (m) => console.error(`error: ${m}`),
    exit: (code: number) => never = (c) => process.exit(c),
): number {
    const parsed = parsePositiveInt(value, name, opts);
    if ("error" in parsed) {
        printError(parsed.error);
        exit(1);
    }
    return parsed.value;
}
