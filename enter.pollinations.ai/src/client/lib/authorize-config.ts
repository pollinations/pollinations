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
 * - `profile`: read name, email, GitHub username, tier, account timestamps
 * - `balance`: read the remaining spending budget on this key (NOT the user's
 *   total account balance — the balance endpoint clamps to the key's budget
 *   when a budget is set, which it always is in the consent flow)
 */
export const BASELINE_CONSENT_PERMISSIONS = ["profile", "balance"] as const;

/**
 * Permissions the user can opt into via the Advanced section. Currently only
 * `usage` (cross-key usage history).
 */
export const OPTIONAL_CONSENT_PERMISSIONS = ["usage"] as const;

export const AUTHORIZE_ALLOWED_ACCOUNT_PERMISSIONS = [
    ...BASELINE_CONSENT_PERMISSIONS,
    ...OPTIONAL_CONSENT_PERMISSIONS,
] as const;

export const AUTHORIZE_VISIBLE_ACCOUNT_PERMISSIONS = OPTIONAL_CONSENT_PERMISSIONS;

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
export function withBaselinePermissions(
    optional: string[] | null,
): string[] {
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
