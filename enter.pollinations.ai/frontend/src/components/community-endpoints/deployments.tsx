import { useCallback, useEffect, useState } from "react";
import {
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "../models/model-catalog.ts";
import { CommunityEndpoints } from "./community-endpoints.tsx";
import {
    type FallbackModelOption,
    publicCommunityFallbackOptions,
} from "./types.ts";

export function Deployments({
    canPublish,
    kind,
}: {
    canPublish: boolean;
    kind: "models" | "agents";
}) {
    const [fallbackOptions, setFallbackOptions] = useState<
        FallbackModelOption[]
    >([]);

    const loadFallbackOptions = useCallback(async () => {
        try {
            const catalog = await fetchModelCatalog({ refresh: true });
            setFallbackOptions(
                publicCommunityFallbackOptions(
                    getModelPricesFromCatalog(catalog),
                ),
            );
        } catch {
            setFallbackOptions([]);
        }
    }, []);

    useEffect(() => {
        void loadFallbackOptions();
    }, [loadFallbackOptions]);

    return (
        <CommunityEndpoints
            key={kind}
            kind={kind}
            canPublish={canPublish}
            fallbackOptions={fallbackOptions}
            onChange={loadFallbackOptions}
        />
    );
}
