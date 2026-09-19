import { useEffect, useMemo, useState } from "react";
import { type ApiModelInfo, fetchModelCatalog } from "./model-catalog.ts";
import { getModelCategoriesFromCatalog } from "./model-categories.ts";

/**
 * The public model catalog, plus any models the caller supplies that the
 * catalog omits — the signed-in user's own non-public ones — grouped into
 * categories. Callers pass only models the catalog leaves out, so the two
 * sources never describe the same model twice.
 *
 * Consent and key editing use this same list in the shared permission picker.
 */
export function useModelCategories(extraModels?: ApiModelInfo[]) {
    const [catalogModels, setCatalogModels] = useState<ApiModelInfo[]>([]);

    useEffect(() => {
        let cancelled = false;

        fetchModelCatalog()
            .then((models) => {
                if (!cancelled) setCatalogModels(models);
            })
            .catch(() => {
                if (!cancelled) setCatalogModels([]);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const catalog = useMemo(
        () => [...catalogModels, ...(extraModels ?? [])],
        [catalogModels, extraModels],
    );
    const categories = useMemo(
        () => getModelCategoriesFromCatalog(catalog),
        [catalog],
    );
    return { catalog, categories };
}
