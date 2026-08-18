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

export function Deployments({ canPublish }: { canPublish: boolean }) {
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
            canPublish={canPublish}
            fallbackOptions={fallbackOptions}
            onChange={loadFallbackOptions}
        />
    );
}
