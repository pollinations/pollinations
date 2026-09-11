import {
    DEFAULT_CONSENT_BUDGET,
    DEFAULT_CONSENT_EXPIRY_DAYS,
} from "@shared/auth/authorize-config.ts";

export const defaultAppPreview: Record<string, string> = {
    protocol: "oauth",
    request_scope: "profile usage keys",
    request_models: "all",
    request_earnings: "1",
    sim_paid: "10",
    sim_quest: "5",
};
export const defaultPreviewRequest = {
    request_scope: defaultAppPreview.request_scope,
    request_models: defaultAppPreview.request_models,
    request_budget: String(DEFAULT_CONSENT_BUDGET),
    request_expiry: String(DEFAULT_CONSENT_EXPIRY_DAYS),
    request_earnings: defaultAppPreview.request_earnings,
    request_attribution: "1",
};
export type AppPreviewProps = {
    appPreview: Record<string, string>;
    onAppPreviewChange: (patch: Record<string, string>) => void;
};

export const previewScopeOptions = [
    { id: "profile", label: "Display name & email" },
    { id: "usage", label: "Account activity" },
    { id: "keys", label: "Account management" },
] as const;

export const previewModelOptions = [
    { id: "all", label: "All models" },
    { id: "none", label: "Off" },
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
    const get = (key: keyof typeof defaultPreviewRequest) =>
        query.get(key) ?? defaultPreviewRequest[key];
    return {
        scopes: get("request_scope").split(/\s+/).filter(Boolean),
        models: get("request_models"),
        budget: get("request_budget"),
        expiry: get("request_expiry"),
        earnings: get("request_earnings") !== "0",
        attribution: get("request_attribution") !== "0",
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
    // "Off" previews declining generation in consent, not a model ID.
    if (request.models !== "all" && request.models !== "none") {
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
