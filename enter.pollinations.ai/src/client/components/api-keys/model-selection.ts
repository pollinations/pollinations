export function normalizeAllowedModelSelection(
    next: string[],
    allModelIds: string[],
): string[] | null {
    return next.length === allModelIds.length ? null : next;
}
