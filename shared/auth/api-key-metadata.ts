export function parseMetadata(
    raw: string | null | undefined,
): Record<string, unknown> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch {
        return {};
    }
}

export function getRedirectUris(meta: Record<string, unknown>): string[] {
    const list = meta.redirectUris;
    return Array.isArray(list)
        ? list.filter(
              (value): value is string =>
                  typeof value === "string" && value.length > 0,
          )
        : [];
}
