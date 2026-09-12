import type { ModelInfo } from "@pollinations/sdk";

export function findModelById(
    models: readonly ModelInfo[],
    id: string,
): ModelInfo | undefined {
    return models.find(
        (model) =>
            (model.name || model.id) === id || model.aliases?.includes(id),
    );
}
