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
 * Permissions that every consent-flow key always receives. Not user-toggleable;
 * surfaced to the user as read-only lines in the consent summary.
 *
 * Currently empty — every scope gates account-wide data. The caller's own key
 * metadata (budget, expiry, permissions) is always readable via `/account/key`,
 * and `githubUsername` + profile image are always readable via
 * `/account/profile`, neither requires a scope.
 */
export const BASELINE_CONSENT_PERMISSIONS = [] as const;

/**
 * Permissions the user can opt into via the Advanced section.
 *
 * - `profile`: read account name and email (username + image are free)
 * - `balance`: read full account balance (key's own budget is free)
 * - `usage`: cross-key account-wide usage (key's own usage is free)
 * - `keys`: create, list, and revoke API keys
 */
export const OPTIONAL_CONSENT_PERMISSIONS = [
    "profile",
    "balance",
    "usage",
    "keys",
] as const;

export const AUTHORIZE_ALLOWED_ACCOUNT_PERMISSIONS = [
    ...BASELINE_CONSENT_PERMISSIONS,
    ...OPTIONAL_CONSENT_PERMISSIONS,
] as const;

export const AUTHORIZE_VISIBLE_ACCOUNT_PERMISSIONS =
    OPTIONAL_CONSENT_PERMISSIONS;

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

/**
 * Merge baseline permissions with whatever optional permissions the user has
 * toggled on. Called at key-creation time so the server always receives the
 * full set.
 */
export function withBaselinePermissions(optional: string[] | null): string[] {
    const merged = new Set<string>(BASELINE_CONSENT_PERMISSIONS);
    for (const p of optional ?? []) merged.add(p);
    return Array.from(merged);
}

export function getAuthorizeInitialPermissions({
    models,
    budget,
    expiry,
    permissions,
}: AuthorizeDefaultsInput) {
    const sanitized = sanitizeAuthorizeAccountPermissions(permissions);
    // Only keep optional permissions in state — baseline is implicit.
    const optional = sanitized?.filter((p) =>
        (OPTIONAL_CONSENT_PERMISSIONS as readonly string[]).includes(p),
    );
    return {
        allowedModels: models,
        pollenBudget: budget ?? DEFAULT_CONSENT_BUDGET,
        expiryDays: expiry ?? DEFAULT_CONSENT_EXPIRY_DAYS,
        accountPermissions: optional && optional.length ? optional : null,
    };
}
