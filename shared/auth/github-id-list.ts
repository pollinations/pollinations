/**
 * Parse a comma-separated list of numeric GitHub user IDs.
 * Strict: only entries matching /^\d+$/ are kept, so "123abc" is dropped
 * instead of being silently truncated to 123.
 */
export function parseGithubIdList(raw: string | undefined | null): Set<number> {
    if (!raw) return new Set();
    const ids = new Set<number>();
    for (const part of raw.split(",")) {
        const trimmed = part.trim();
        if (!/^\d+$/.test(trimmed)) continue;
        const n = Number(trimmed);
        if (n > 0) ids.add(n);
    }
    return ids;
}
