import {
    type Category,
    getModelDefinition,
    getModels,
    type ModelName,
    resolveModelName,
} from "@shared/registry/registry.ts";

export const getModelDisplayName = (modelId: string): string => {
    try {
        const service = getModelDefinition(
            resolveModelName(modelId) as ModelName,
        );
        return [service.model, service.version].filter(Boolean).join(" ");
    } catch {
        return modelId;
    }
};

export type CategorizedModelOption = {
    id: string;
    label: string;
};

export const getVisibleModelsByCategory = (): Record<
    Category,
    CategorizedModelOption[]
> => {
    const grouped: Record<Category, CategorizedModelOption[]> = {
        text: [],
        image: [],
        video: [],
        audio: [],
    };

    for (const id of getModels()) {
        const service = getModelDefinition(id as ModelName);
        if (service.hidden) continue;

        grouped[service.category].push({
            id,
            label: getModelDisplayName(id),
        });
    }

    for (const category of Object.keys(grouped) as Category[]) {
        grouped[category].sort((a, b) => a.label.localeCompare(b.label));
    }

    return grouped;
};
