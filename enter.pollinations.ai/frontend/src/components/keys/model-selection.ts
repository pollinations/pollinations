import { MODEL_CATEGORY_ORDER } from "../models/model-categories.ts";
import type { ModelCategory } from "../models/types.ts";

export type ModelSelection = {
    categories: Set<ModelCategory>;
    /** Model IDs the key allows beside its categories. */
    models: string[];
};

const isCategory = (value: string): value is ModelCategory =>
    MODEL_CATEGORY_ORDER.includes(value as ModelCategory);

/**
 * Splits a key's model permissions into categories and model IDs; null allows
 * every category. The dashboard toggles categories and can only remove model
 * IDs, so saving never widens a key limited to specific models.
 */
export function readModelSelection(
    allowedModels: string[] | null,
): ModelSelection {
    if (allowedModels === null) {
        return { categories: new Set(MODEL_CATEGORY_ORDER), models: [] };
    }
    return {
        categories: new Set(allowedModels.filter(isCategory)),
        models: allowedModels.filter((value) => !isCategory(value)),
    };
}

/** Every category selected allows every model, so it is stored as null. */
export function writeModelSelection({
    categories,
    models,
}: ModelSelection): string[] | null {
    if (categories.size === MODEL_CATEGORY_ORDER.length) return null;
    return [
        ...MODEL_CATEGORY_ORDER.filter((category) => categories.has(category)),
        ...models,
    ];
}
