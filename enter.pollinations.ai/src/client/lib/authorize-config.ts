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
export const AUTHORIZE_ALLOWED_ACCOUNT_PERMISSIONS = [
    ...DEFAULT_CONSENT_ACCOUNT_PERMISSIONS,
    "usage",
] as const;
export const AUTHORIZE_VISIBLE_ACCOUNT_PERMISSIONS = ["usage"] as const;

export function sanitizeAuthorizeAccountPermissions(
    permissions: string[] | null | undefined,
): string[] | null {
    if (!permissions?.length) return null;

    const filtered = Array.from(
        new Set(
            permissions.filter((permission) =>
                AUTHORIZE_ALLOWED_ACCOUNT_PERMISSIONS.includes(
                    permission as (typeof AUTHORIZE_ALLOWED_ACCOUNT_PERMISSIONS)[number],
                ),
            ),
        ),
    );

    return filtered.length ? filtered : null;
}

export function getAuthorizeDevicePermissions(
    deviceScopes: string[] | null | undefined,
): string[] {
    return (
        sanitizeAuthorizeAccountPermissions([
            "profile",
            ...(deviceScopes ?? []),
        ]) ?? ["profile"]
    );
}

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
        accountPermissions: sanitizeAuthorizeAccountPermissions(
            permissions,
        ) ?? [...DEFAULT_CONSENT_ACCOUNT_PERMISSIONS],
    };
}
