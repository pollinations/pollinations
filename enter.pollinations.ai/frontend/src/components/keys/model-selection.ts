export function normalizeAllowedModelSelection(
    next: string[],
    allModelIds: string[],
): string[] | null {
    const uniqueNext = new Set(next);
    const hasExactFullSelection =
        uniqueNext.size === allModelIds.length &&
        allModelIds.every((id) => uniqueNext.has(id));

    return hasExactFullSelection ? null : next;
}
