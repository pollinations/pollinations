import { isAllowedRedirectUrl } from "./redirect-uri.ts";

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

// Shared by server validation and its local preview case.
export const INVALID_AUTHORIZATION_CLIENT_MESSAGE = "Invalid client_id";

export const DEFAULT_CONSENT_BUDGET = 5;
export const DEFAULT_CONSENT_EXPIRY_DAYS = 7;

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * The expiry field is in days and accepts fractions, but key creation takes
 * whole seconds (`z.number().int().positive()`), so a fraction landing
 * mid-second failed validation. Rounding is the whole fix.
 *
 * An empty field is the only thing that means "no expiry". Anything invalid
 * stays invalid and the server rejects it, which the dialogs surface.
 */
export function expiryDaysToExpiresIn(
    expiryDays: number | null | undefined,
): number | undefined {
    if (expiryDays == null) return undefined;
    return Math.round(expiryDays * SECONDS_PER_DAY);
}

export function getExpiryDaysError(expiryDays: number | null): string | null {
    if (expiryDays === null) return null;
    if (
        !Number.isFinite(expiryDays) ||
        expiryDays < 1 / SECONDS_PER_DAY ||
        expiryDays > 365
    )
        return "Use a duration from 1 second to 365 days, or leave empty for no expiry.";
    return null;
}

/**
 * An S256 PKCE code_challenge is exactly 43 base64url chars (unpadded
 * SHA-256, RFC 7636 §4.2). Single source of truth for the consent page's
 * front-door check and the server's CreateCodeSchema.
 */
export const PKCE_S256_CHALLENGE_REGEX = /^[A-Za-z0-9_-]{43}$/;

/** Request validity is independent of whether we can identify the app. */
export function getAuthorizeRequestError(request: {
    redirectUrl?: string;
    appKey?: string;
    responseType?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
}): string | null {
    if (!request.redirectUrl) return "No redirect URL provided";
    try {
        if (!isAllowedRedirectUrl(new URL(request.redirectUrl)))
            return "Redirect URL must use HTTPS (HTTP is allowed for localhost).";
    } catch {
        return "Invalid redirect URL format";
    }
    if (request.responseType && request.responseType !== "code")
        return 'Unsupported response_type — only "code" is supported.';
    if (request.responseType === "code") {
        if (!request.appKey)
            return "client_id is required for the authorization code flow";
        if (!request.codeChallenge)
            return "PKCE code_challenge is required for the authorization code flow";
        if (request.codeChallengeMethod !== "S256")
            return "code_challenge_method=S256 is required (only S256 is supported)";
        if (!PKCE_S256_CHALLENGE_REGEX.test(request.codeChallenge))
            return "code_challenge must be a 43-character base64url S256 challenge";
    }
    return null;
}

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
        expiryDays: expiry ?? DEFAULT_CONSENT_EXPIRY_DAYS,
        accountPermissions: sanitizeAuthorizeAccountPermissions(permissions),
    };
}

/** Disabling generation grants no spending allowance; keep the draft budget in
 * the form so toggling generation back on can restore it. */
export function getAuthorizePollenBudget(
    allowedModels: readonly string[] | null,
    pollenBudget: number | null,
): number | null {
    return allowedModels?.length === 0 ? 0 : pollenBudget;
}
