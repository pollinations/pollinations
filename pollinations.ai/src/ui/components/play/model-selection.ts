export function findModelById<
    T extends { id: string; aliases?: readonly string[] },
>(models: readonly T[], requestedId: string): T | undefined {
    return (
        models.find((model) => model.id === requestedId) ??
        models.find((model) => model.aliases?.includes(requestedId))
    );
}
