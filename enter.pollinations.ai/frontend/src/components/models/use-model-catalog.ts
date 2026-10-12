import { useEffect, useState } from "react";
import { type ApiModelInfo, fetchModelCatalog } from "./model-catalog.ts";

/** The public model catalog; empty until loaded or when the fetch fails. */
export function useModelCatalog(): ApiModelInfo[] {
    const [catalog, setCatalog] = useState<ApiModelInfo[]>([]);

    useEffect(() => {
        let cancelled = false;

        fetchModelCatalog()
            .then((models) => {
                if (!cancelled) setCatalog(models);
            })
            .catch(() => {
                if (!cancelled) setCatalog([]);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return catalog;
}
