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

type DeploymentsProps = {
    canPublish: boolean;
    creationDisabled?: boolean;
};

export function Deployments({
    canPublish,
    creationDisabled = false,
}: DeploymentsProps) {
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
            creationDisabled={creationDisabled}
            fallbackOptions={fallbackOptions}
            onChange={loadFallbackOptions}
        />
    );
}
