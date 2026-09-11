export const previewScopeOptions = [
    { id: "profile", label: "Display name & email" },
    { id: "usage", label: "Account activity" },
    { id: "keys", label: "Account management" },
] as const;

export const previewModelOptions = [
    { id: "all", label: "All models" },
    { id: "selected", label: "Selected models" },
    { id: "paid", label: "Paid only" },
    { id: "community", label: "Community models" },
    { id: "unlisted", label: "Unlisted model" },
] as const;

// Consent changes only when Paid Pollen is absent or both balances are empty.
export const previewPollenOptions = [
    { id: "paid", label: "Paid available", paid: 10, quest: 5 },
    { id: "quest", label: "Quest only", paid: 0, quest: 5 },
    { id: "empty", label: "No Pollen", paid: 0, quest: 0 },
] as const;

export function readPreviewRequest(query: URLSearchParams) {
    return {
        scopes: (query.get("request_scope") ?? "profile usage keys")
            .split(/\s+/)
            .filter(Boolean),
        models: query.get("request_models") ?? "all",
        budget: query.get("request_budget") ?? "5",
        expiry: query.get("request_expiry") ?? "7",
        earnings: query.get("request_earnings") !== "0",
        attribution: query.get("request_attribution") !== "0",
    };
}

type CatalogModel = { name: string; paid_only?: boolean; community?: boolean };

/** Use the real /authorize wire format, including comma-separated model IDs. */
export function previewAuthorizeParams(
    query: URLSearchParams,
    catalog: CatalogModel[] = [],
) {
    const request = readPreviewRequest(query);
    const params = new URLSearchParams({ scope: request.scopes.join(" ") });
    if (request.budget !== "") params.set("budget", request.budget);
    if (request.expiry !== "") params.set("expiry", request.expiry);
    if (request.models !== "all") {
        const ids =
            request.models === "unlisted"
                ? ["unlisted-preview-model"]
                : catalog
                      .filter((model) =>
                          request.models === "paid"
                              ? model.paid_only === true
                              : request.models === "community"
                                ? model.community === true
                                : !model.community,
                      )
                      .slice(0, 3)
                      .map((model) => model.name);
        if (!ids.length)
            throw new Error(
                "No models match this preview. Choose another model example.",
            );
        params.set("models", ids.join(","));
    }
    return params;
}
