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

const SECONDS_PER_DAY = 24 * 60 * 60;
const MAX_EXPIRY_DAYS = 365;

/**
 * The expiry field is in days and accepts fractions, but key creation takes
 * whole seconds (`z.number().int().positive()`), so a fraction that lands
 * mid-second used to 400. Rounding is the whole fix.
 *
 * Nothing here rescues a non-positive value: an empty field means no expiry,
 * and 0 or a negative stays invalid so the server rejects it rather than the
 * UI quietly turning it into a key that never expires.
 */
export function expiryDaysToExpiresIn(
    expiryDays: number | null | undefined,
): number | undefined {
    if (expiryDays == null) return undefined;
    return Math.round(expiryDays * SECONDS_PER_DAY);
}

/**
 * The consent screen's expiry comes from the caller's own query string, so a
 * third-party app must not be able to steer it. Only a positive, finite value
 * inside the server's 365-day ceiling is honoured; anything else falls back to
 * the default, so a hostile `?expiry=0` can neither mint a permanent key nor
 * dead-end the flow on the server's positive-integer check.
 */
export function sanitizeConsentExpiryDays(
    expiry: number | null | undefined,
): number {
    if (
        expiry == null ||
        !Number.isFinite(expiry) ||
        expiry <= 0 ||
        expiry > MAX_EXPIRY_DAYS
    ) {
        return DEFAULT_CONSENT_EXPIRY_DAYS;
    }
    return expiry;
}

/**
 * An S256 PKCE code_challenge is exactly 43 base64url chars (unpadded
 * SHA-256, RFC 7636 §4.2). Single source of truth for the consent page's
 * front-door check and the server's CreateCodeSchema.
 */
export const PKCE_S256_CHALLENGE_REGEX = /^[A-Za-z0-9_-]{43}$/;

/**
 * Account permissions the user can grant at the consent screen. Every scope is
 * opt-in — nothing is implicit. A caller's own key metadata (`/account/key`),
 * its budget, its usage (`/account/key/usage`), and the user's github username +
 * image (`/account/profile`) are all readable without any scope.
 *
 * - `profile`: read account name and email
 * - `usage`: read full account balance + account-wide usage (key's own
 *   balance and usage are free regardless)
 * - `keys`: account admin; create, list, and revoke API keys, plus My Models
 *   access where enabled.
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
        pollenBudget: budget ?? DEFAULT_CONSENT_BUDGET,
        expiryDays: sanitizeConsentExpiryDays(expiry),
        accountPermissions: sanitizeAuthorizeAccountPermissions(permissions),
    };
}
