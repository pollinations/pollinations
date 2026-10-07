import {
    type ApiModelInfo,
    getCatalogCategory,
    getCatalogModelId,
} from "../models/model-catalog.ts";
import { MODEL_CATEGORY_ORDER } from "../models/model-categories.ts";
import type { ModelCategory } from "../models/types.ts";

export type ModelSelection = {
    categories: Set<ModelCategory>;
    /** Values the catalog does not know, left for the server to resolve. */
    unknown: string[];
};

/**
 * Reads a key's model permissions as categories; null allows all of them. A
 * model ID or alias counts as its catalog category, as the server widens it the
 * same way when the key is saved.
 */
export function readModelSelection(
    allowedModels: string[] | null,
    catalog: ApiModelInfo[],
): ModelSelection {
    if (allowedModels === null) {
        return { categories: new Set(MODEL_CATEGORY_ORDER), unknown: [] };
    }
    const categoryById = new Map(
        catalog.flatMap((model) =>
            [getCatalogModelId(model), ...(model.aliases ?? [])].map(
                (id) => [id, getCatalogCategory(model)] as const,
            ),
        ),
    );
    const categories = new Set<ModelCategory>();
    const unknown: string[] = [];
    for (const value of allowedModels) {
        const category = MODEL_CATEGORY_ORDER.includes(value as ModelCategory)
            ? (value as ModelCategory)
            : categoryById.get(value);
        if (category) categories.add(category);
        else unknown.push(value);
    }
    return { categories, unknown };
}

/** Every category selected allows every model, so it is stored as null. */
export function writeModelSelection({
    categories,
    unknown,
}: ModelSelection): string[] | null {
    if (categories.size === MODEL_CATEGORY_ORDER.length) return null;
    return [
        ...MODEL_CATEGORY_ORDER.filter((category) => categories.has(category)),
        ...unknown,
    ];
}
