/**
 * Parse potentially double-serialized JSON metadata from a DB row.
 * Returns an empty object for null/undefined/invalid input.
 */
export function parseMetadata(
    raw: string | null | undefined,
): Record<string, unknown> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
    } catch {
        return {};
    }
}
