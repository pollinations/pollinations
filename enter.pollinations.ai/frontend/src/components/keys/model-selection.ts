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

/** Consent may narrow a request, but reselecting every offered model must not
 * turn a finite request into an unrestricted key. */
export function toggleConsentModel(
    current: string[] | null,
    requestedIds: string[],
    modelId: string,
): string[] {
    const selected = current ?? requestedIds;
    if (!requestedIds.includes(modelId)) return selected;
    return selected.includes(modelId)
        ? selected.filter((id) => id !== modelId)
        : [...selected, modelId];
}

/** Apply a filtered bulk selection without changing hidden models or widening the grant. */
export function setConsentModelGroup(
    current: string[] | null,
    requestedIds: string[],
    groupIds: string[],
    enabled: boolean,
): string[] {
    const group = new Set(groupIds);
    const selected = new Set(current ?? requestedIds);
    return requestedIds.filter((id) =>
        group.has(id) ? enabled : selected.has(id),
    );
}
