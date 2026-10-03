import type { Model } from "../../../hooks/useModelList";

export function findModelById<
    T extends { id: string; aliases?: readonly string[] },
>(models: readonly T[], requestedId: string): T | undefined {
    return (
        models.find((model) => model.id === requestedId) ??
        models.find((model) => model.aliases?.includes(requestedId))
    );
}

export function getModelImageUrls(
    model: Model | undefined,
    imageUrls: string[],
): string[] {
    return model?.hasImageInput ? imageUrls : [];
}
