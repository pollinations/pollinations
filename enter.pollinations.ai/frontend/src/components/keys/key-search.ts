export type KeySearch = {
    view?: "apps";
};

export function validateKeySearch(search: Record<string, unknown>): KeySearch {
    return {
        view: search.view === "apps" ? "apps" : undefined,
    };
}
