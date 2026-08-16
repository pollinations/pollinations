import { endpointDelegatesGeneration } from "@shared/community-endpoints.ts";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import type { ApiModelInfo } from "./model-catalog.ts";

/**
 * The signed-in account's own community models, in catalog form, so pickers can
 * offer the ones the anonymous catalog omits.
 *
 * This list only decides what is offered. What a key may actually call is
 * decided at call time by gen (canAccessCommunityModel), so nothing here needs
 * to restate the access rule — public models are left in and simply lose the
 * merge to their richer catalog entry.
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
                        .filter((model) => !model.disabled)
                        .map((model) => ({
                            name: model.modelId,
                            title: model.title,
                            category:
                                model.modality === "image"
                                    ? ("image" as const)
                                    : ("text" as const),
                            community: true,
                            agent: endpointDelegatesGeneration(model),
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
