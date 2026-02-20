/**
 * Simple object cleaning utilities
 */
import debug from "debug";

const log = debug("pollinations:utils:cleaners");

const PROTECTED_KEYS = new Set(["modalities", "audio"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Removes undefined values from an object (shallow).
 */
export function cleanUndefined(obj: unknown): unknown {
    if (!isPlainObject(obj)) return obj;

    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined),
    );
}

/**
 * Removes null and undefined values from an object (recursive).
 * Protected keys ("modalities", "audio") are never removed.
 */
export function cleanNullAndUndefined(obj: unknown): unknown {
    if (!isPlainObject(obj)) return obj;

    log(
        "Cleaning null and undefined values from object keys: %s",
        Object.keys(obj).join(", "),
    );

    const cleaned: Record<string, unknown> = {};
    const removedProps: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
        if (PROTECTED_KEYS.has(key)) {
            cleaned[key] = value;
            continue;
        }

        if (value === undefined || value === null) {
            removedProps.push(
                `${key}: ${value === null ? "null" : "undefined"}`,
            );
            continue;
        }

        if (isPlainObject(value)) {
            const nested = cleanNullAndUndefined(value) as Record<
                string,
                unknown
            >;
            if (nested && Object.keys(nested).length > 0) {
                cleaned[key] = nested;
            } else {
                removedProps.push(`${key}: (empty object after cleaning)`);
            }
            continue;
        }

        cleaned[key] = value;
    }

    if (removedProps.length > 0) {
        log("Removed properties: %s", removedProps.join(", "));
    }
    log("Cleaned object now has keys: %s", Object.keys(cleaned).join(", "));

    return cleaned;
}
