import { useEffect, useMemo, useState } from "react";
import { type ApiModelInfo, fetchModelCatalog } from "./model-catalog.ts";
import {
    getModelCategoriesFromCatalog,
    type ModelCategoryGroup,
    mergeCatalogModels,
} from "./model-categories.ts";

/**
 * The public model catalog, plus any models the caller supplies that the
 * catalog omits — an app's own "app"-visibility models, and the signed-in
 * user's own private ones — grouped into categories.
 *
 * The consent screen and the permission picker have to agree on this list: one
 * renders the summary of what is being granted and the other renders the
 * checkboxes, so a divergence would describe two different grants.
 *
 * See mergeCatalogModels() for how the two sources are reconciled.
 */
export function useModelCategories(
    extraModels?: ApiModelInfo[],
): ModelCategoryGroup[] {
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

    return useMemo(
        () =>
            getModelCategoriesFromCatalog(
                mergeCatalogModels(catalogModels, extraModels),
            ),
        [catalogModels, extraModels],
    );
}
