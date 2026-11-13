import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
    type ApiModelInfo,
    fetchModelCatalog,
    getCatalogModelId,
    getModelPricesFromCatalog,
} from "../models/model-catalog.ts";
import { CommunityEndpoints } from "./community-endpoints.tsx";
import {
    type FallbackModelOption,
    publicCommunityFallbackOptions,
} from "./types.ts";

export function Deployments({
    canPublish,
    onProfileRetry,
    appsTab,
}: {
    canPublish: boolean | null;
    onProfileRetry: () => unknown;
    appsTab: { action: ReactNode; content: ReactNode };
}) {
    const [fallbackOptions, setFallbackOptions] = useState<
        FallbackModelOption[]
    >([]);
    const [healthByModelId, setHealthByModelId] = useState<Record<
        string,
        ApiModelInfo["health"]
    > | null>({});

    const loadFallbackOptions = useCallback(async () => {
        try {
            const catalog = await fetchModelCatalog({ refresh: true });
            setFallbackOptions(
                publicCommunityFallbackOptions(
                    getModelPricesFromCatalog(catalog),
                ),
            );
            setHealthByModelId(
                Object.fromEntries(
                    catalog.map((model) => [
                        getCatalogModelId(model),
                        model.health,
                    ]),
                ),
            );
        } catch {
            setFallbackOptions([]);
            setHealthByModelId(null);
        }
    }, []);

    useEffect(() => {
        void loadFallbackOptions();
    }, [loadFallbackOptions]);

    return (
        <CommunityEndpoints
            canPublish={canPublish}
            onProfileRetry={onProfileRetry}
            appsTab={appsTab}
            fallbackOptions={fallbackOptions}
            healthByModelId={healthByModelId}
            onChange={loadFallbackOptions}
        />
    );
}
