const PROTECTED_KEYS = new Set(["modalities", "audio"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Removes null/undefined values recursively. Protected keys are never removed. */
export function cleanNullAndUndefined(obj: unknown): unknown {
    if (!isPlainObject(obj)) return obj;

    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (PROTECTED_KEYS.has(key)) {
            cleaned[key] = value;
            continue;
        }

        if (value === undefined || value === null) continue;

        if (isPlainObject(value)) {
            const nested = cleanNullAndUndefined(value) as Record<
                string,
                unknown
            >;
            if (nested && Object.keys(nested).length > 0) {
                cleaned[key] = nested;
            }
            continue;
        }

        cleaned[key] = value;
    }

    return cleaned;
}
