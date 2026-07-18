function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Removes top-level null/undefined values from provider request options. */
export function cleanNullAndUndefined(obj: unknown): unknown {
    if (!isPlainObject(obj)) return obj;

    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null) continue;

        cleaned[key] = value;
    }

    return cleaned;
}
