import { useEffect, useMemo, useState } from "react";
import {
    type ApiModelInfo,
    fetchModelCatalog,
    getCatalogModelId,
} from "./model-catalog.ts";
import {
    getModelCategoriesFromCatalog,
    type ModelCategoryGroup,
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
 * The catalog wins any id it already lists: its entries are generated from the
 * same rows but carry pricing, capabilities and the agent flag that the extras
 * projection cannot reconstruct. Extras only fill the gaps — models the
 * anonymous catalog omits — and win over each other in order, so a developer
 * authorizing their own app sees one entry per model rather than one per source.
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

    return useMemo(() => {
        const byId = new Map<string, ApiModelInfo>();
        for (const model of [...(extraModels ?? []), ...catalogModels]) {
            byId.set(getCatalogModelId(model), model);
        }
        return getModelCategoriesFromCatalog([...byId.values()]);
    }, [catalogModels, extraModels]);
}
