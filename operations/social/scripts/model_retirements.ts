import {
    getModels,
    getRegistryModelDefinition,
    isVisibleModelDefinition,
} from "../../../shared/registry/registry.ts";

// Read the same bundled definitions used by Gen; no duplicate schedule.
console.log(
    JSON.stringify(
        getModels().flatMap((model) => {
            const definition = getRegistryModelDefinition(model);
            if (
                !isVisibleModelDefinition(definition) ||
                !definition.retirementDate
            ) {
                return [];
            }
            return [
                {
                    model,
                    title: definition.title || model,
                    category: definition.category,
                    date: new Date(definition.retirementDate)
                        .toISOString()
                        .slice(0, 10),
                },
            ];
        }),
    ),
);
