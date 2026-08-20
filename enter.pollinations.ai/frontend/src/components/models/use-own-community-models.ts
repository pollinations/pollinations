import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import type { ApiModelInfo } from "./model-catalog.ts";

/**
 * The signed-in account's own community models that the anonymous catalog
 * omits, in catalog form, so pickers can offer them.
 *
 * Public ones are dropped because the catalog already lists them, with pricing
 * and capabilities this five-field projection cannot reconstruct.
 *
 * Returns an empty list until loaded, and on failure, so a picker degrades to
 * the public catalog rather than blocking.
 */
export function useOwnCommunityModels(enabled = true): ApiModelInfo[] {
    const [models, setModels] = useState<ApiModelInfo[]>([]);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;

        void (async () => {
            try {
                const response = await apiClient.account["my-models"].$get();
                if (!response.ok) return;
                const { data } = await response.json();
                if (cancelled) return;
                setModels(
                    data
                        .filter(
                            (model) =>
                                !model.hidden && model.visibility !== "public",
                        )
                        .map((model) => ({
                            name: model.modelId,
                            title: model.title,
                            category:
                                model.modality === "image"
                                    ? ("image" as const)
                                    : ("text" as const),
                            community: true,
                            agent: model.type !== "proxy",
                        })),
                );
            } catch {
                // Leave the picker on the public catalog alone.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [enabled]);

    return models;
}
