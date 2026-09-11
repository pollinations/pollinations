import { useCallback, useEffect, useMemo, useState } from "react";
import { type ApiModelInfo, fetchModelCatalog } from "./model-catalog.ts";
import { getModelCategoriesFromCatalog } from "./model-categories.ts";

/**
 * The public model catalog, plus any models the caller supplies that the
 * catalog omits — the signed-in user's own non-public ones — grouped into
 * categories. Callers pass only models the catalog leaves out, so the two
 * sources never describe the same model twice.
 *
 * The consent screen and the permission picker have to agree on this list: one
 * renders the summary of what is being granted and the other renders the
 * checkboxes, so a divergence would describe two different grants.
 */
export function useModelCategories(extraModels?: ApiModelInfo[]) {
    const [catalogModels, setCatalogModels] = useState<ApiModelInfo[]>([]);
    const [status, setStatus] = useState<"loading" | "ready" | "error">(
        "loading",
    );
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => {
        setStatus("loading");
        setAttempt((value) => value + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;

        fetchModelCatalog({ refresh: attempt > 0 })
            .then((models) => {
                if (cancelled) return;
                setCatalogModels(models);
                setStatus("ready");
            })
            .catch(() => {
                if (!cancelled) setStatus("error");
            });

        return () => {
            cancelled = true;
        };
    }, [attempt]);

    const catalog = useMemo(
        () => [...catalogModels, ...(extraModels ?? [])],
        [catalogModels, extraModels],
    );
    const categories = useMemo(
        () => getModelCategoriesFromCatalog(catalog),
        [catalog],
    );
    return { catalog, categories, status, retry };
}
