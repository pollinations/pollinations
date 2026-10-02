import type { ModelCategoryModel } from "../models/model-categories.ts";

/** A full selection means "all models" only when the catalog is complete;
 * otherwise picking every visible model could grant ones never shown. */
export function normalizeAllowedModelSelection(
    next: string[],
    allModelIds: string[],
    catalogLoaded = true,
): string[] | null {
    const uniqueNext = new Set(next);
    const hasExactFullSelection =
        catalogLoaded &&
        uniqueNext.size > 0 &&
        uniqueNext.size === allModelIds.length &&
        allModelIds.every((id) => uniqueNext.has(id));

    return hasExactFullSelection ? null : next;
}

/** Catalog models plus selected IDs it lacks (retired, misspelled or not yet
 * loaded), so bulk toggles can reach every model the selection holds. */
export function withUncataloguedModels(
    catalogModels: ModelCategoryModel[],
    selectedIds: string[] | null,
): ModelCategoryModel[] {
    const catalogIds = new Set(catalogModels.map(({ id }) => id));
    const missingIds = new Set(
        (selectedIds ?? []).filter((id) => !catalogIds.has(id)),
    );
    return [
        ...catalogModels,
        ...[...missingIds].map((id) => ({ id, label: id })),
    ];
}

/** Toggle one offered model; an unrestricted (null) selection first expands
 * to the offered list. Callers decide whether a full list means "all". */
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
    for (const id of requestedIds) {
        if (!group.has(id)) continue;
        if (enabled) selected.add(id);
        else selected.delete(id);
    }
    return [...selected];
}

/** One click per category: an empty group fills, a full or partial one clears. */
export function toggleConsentModelGroup(
    current: string[] | null,
    requestedIds: string[],
    groupIds: string[],
): string[] {
    const isEmpty = !groupIds.some(
        (id) => requestedIds.includes(id) && (current?.includes(id) ?? true),
    );
    return setConsentModelGroup(current, requestedIds, groupIds, isEmpty);
}
