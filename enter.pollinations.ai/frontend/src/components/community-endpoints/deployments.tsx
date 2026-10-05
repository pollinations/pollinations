import { useCallback, useEffect, useState } from "react";
import {
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "../models/model-catalog.ts";
import { CommunityEndpoints } from "./community-endpoints.tsx";
import { type SequenceModelOption, Sequences } from "./sequences.tsx";
import {
    type FallbackModelOption,
    publicCommunityFallbackOptions,
} from "./types.ts";

export function Deployments({ canPublish }: { canPublish: boolean }) {
    const [fallbackOptions, setFallbackOptions] = useState<
        FallbackModelOption[]
    >([]);
    const [sequenceOptions, setSequenceOptions] = useState<
        SequenceModelOption[]
    >([]);

    const loadFallbackOptions = useCallback(async () => {
        try {
            const catalog = await fetchModelCatalog({ refresh: true });
            const models = getModelPricesFromCatalog(catalog);
            setFallbackOptions(publicCommunityFallbackOptions(models));
            // Sequence targets: every visible catalog model, static or
            // community, except agents (they delegate generation).
            setSequenceOptions(
                models
                    .filter((model) => !model.agent)
                    .map((model) => ({
                        modelId: model.name,
                        type: model.type,
                    })),
            );
        } catch {
            setFallbackOptions([]);
            setSequenceOptions([]);
        }
    }, []);

    useEffect(() => {
        void loadFallbackOptions();
    }, [loadFallbackOptions]);

    return (
        <>
            <Sequences
                modelOptions={sequenceOptions}
                onChange={loadFallbackOptions}
            />
            <CommunityEndpoints
                canPublish={canPublish}
                fallbackOptions={fallbackOptions}
                onChange={loadFallbackOptions}
            />
        </>
    );
}
