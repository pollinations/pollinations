/**
 * Parse a scope/permissions URL parameter. Accepts both OAuth-canonical
 * space-separated format (`scope=usage%20keys`) and our legacy
 * comma-separated format (`permissions=usage,keys`).
 */
export function parseScopeList(val: unknown): string[] | null {
    if (typeof val !== "string" || !val) return null;
    const items = val
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    return items.length ? items : null;
}

type AuthorizeDefaultsInput = {
    models?: string[] | null;
    budget?: number | null;
    expiry?: number | null;
    permissions?: string[] | null;
};

export const DEFAULT_CONSENT_BUDGET = 5;
export const DEFAULT_CONSENT_EXPIRY_DAYS = 7;

/**
 * Account permissions the user can grant at the consent screen. Every scope is
 * opt-in — nothing is implicit. A caller's own key metadata (`/account/key`),
 * its budget, its usage (`/account/key/usage`), and the user's github username +
 * image (`/account/profile`) are all readable without any scope.
 *
 * - `profile`: read account name and email
 * - `usage`: read full account balance + account-wide usage (key's own
 *   balance and usage are free regardless)
 * - `keys`: create, list, and revoke API keys
 */
export const CONSENT_PERMISSIONS = ["profile", "usage", "keys"] as const;

export function sanitizeAuthorizeAccountPermissions(
    permissions: string[] | null | undefined,
): string[] | null {
    if (!permissions?.length) return null;

    const filtered = Array.from(
        new Set(
            permissions.filter((permission) =>
                CONSENT_PERMISSIONS.includes(
                    permission as (typeof CONSENT_PERMISSIONS)[number],
                ),
            ),
        ),
    );

    return filtered.length ? filtered : null;
}

export function getAuthorizeInitialPermissions({
    models,
    budget,
    expiry,
    permissions,
}: AuthorizeDefaultsInput) {
    return {
        allowedModels: models,
        pollenBudget: budget === undefined ? DEFAULT_CONSENT_BUDGET : budget,
        expiryDays: expiry ?? DEFAULT_CONSENT_EXPIRY_DAYS,
        accountPermissions: sanitizeAuthorizeAccountPermissions(permissions),
    };
}
