type AuthorizeDefaultsInput = {
    models?: string[] | null;
    budget?: number | null;
    expiry?: number | null;
    permissions?: string[] | null;
};

export const DEFAULT_CONSENT_BUDGET = 5;
export const DEFAULT_CONSENT_EXPIRY_DAYS = 7;
export const DEFAULT_CONSENT_ACCOUNT_PERMISSIONS = [
    "profile",
    "balance",
] as const;
export const AUTHORIZE_VISIBLE_ACCOUNT_PERMISSIONS = ["usage"] as const;

export function getAuthorizeInitialPermissions({
    models,
    budget,
    expiry,
    permissions,
}: AuthorizeDefaultsInput) {
    return {
        allowedModels: models,
        pollenBudget: budget ?? DEFAULT_CONSENT_BUDGET,
        expiryDays: expiry ?? DEFAULT_CONSENT_EXPIRY_DAYS,
        accountPermissions: permissions ?? [
            ...DEFAULT_CONSENT_ACCOUNT_PERMISSIONS,
        ],
    };
}
