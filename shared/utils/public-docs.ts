export function isPublicEnterPath(path: string): boolean {
    return isPublicAccountPath(path) || isPublicQuestCatalogPath(path);
}

function isPublicAccountPath(path: string): boolean {
    return (
        path === "/account" ||
        path.startsWith("/account/") ||
        path === "/api/account" ||
        path.startsWith("/api/account/")
    );
}

// Only the catalog is part of the public gen API. Session-only dashboard quest
// actions stay on enter and are omitted from the merged gen docs.
export function isPublicQuestCatalogPath(path: string): boolean {
    return path === "/quests/catalog" || path === "/api/quests/catalog";
}

export function publicEnterPath(path: string): string {
    return path
        .replace(/^\/api\/account(?=\/|$)/, "/account")
        .replace(/^\/api\/quests(?=\/|$)/, "/quests");
}
