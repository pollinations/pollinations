import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import type { ApiModelInfo } from "./model-catalog.ts";

/**
 * The signed-in account's own community models, in catalog form.
 *
 * Any key the account holds can call these — the access rule matches the
 * endpoint owner against the caller — but the public catalog omits them, so
 * every surface that offers models to scope a key has to ask for them
 * separately. Public ones are left out because the catalog already carries
 * them.
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
                                !model.disabled &&
                                model.visibility !== "public",
                        )
                        .map((model) => ({
                            name: model.modelId,
                            title: model.title,
                            category:
                                model.modality === "image"
                                    ? ("image" as const)
                                    : ("text" as const),
                            community: true,
                            agent: model.agentId !== null,
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
