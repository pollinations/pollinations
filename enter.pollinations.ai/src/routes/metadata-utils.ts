/**
 * Parse potentially double-serialized JSON metadata from a DB row.
 * Returns an empty object for null/undefined/invalid input.
 */
export function parseMetadata(
    raw: string | null | undefined,
): Record<string, unknown> {
    if (!raw) return {};
    try {
        let parsed = JSON.parse(raw);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}
