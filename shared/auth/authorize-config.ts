import {
    isLoopbackHostname,
    parseAuthorizeRedirectUrl,
} from "./redirect-uri.ts";

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

/**
 * An https client_id is a Client ID Metadata Document URL (MCP clients such
 * as Claude Code or Codex). Every other client_id is a registered pk_ app.
 */
export function isClientMetadataUrl(clientId: string | undefined): boolean {
    return !!clientId?.startsWith("https://");
}

export const DEFAULT_CONSENT_BUDGET = 5;
export const DEFAULT_CONSENT_EXPIRY_DAYS = 7;
/** The most budget a link can pre-fill; the user can raise it by hand. */
export const MAX_LINK_CONSENT_BUDGET = 10;

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
 * - `machines`: create and run hosted sandboxes.
 */
export const CONSENT_PERMISSIONS = [
    "profile",
    "usage",
    "keys",
    "machines",
] as const;

export const OAUTH_SCOPES = ["generate", ...CONSENT_PERMISSIONS] as const;

/** Generation is inherent to API keys; account scopes remain opt-in. */
export function getGrantedOAuthScope(
    requested: ReadonlySet<string>,
    accountPermissions: string[],
): string | undefined {
    if (!requested.size) return undefined;
    return [
        ...(requested.has("generate") ? ["generate"] : []),
        ...accountPermissions,
    ].join(" ");
}

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

/**
 * Most people click "Allow" without reading, so a link can request `keys` and
 * `machines` but never tick them: the user has to grant those on purpose.
 */
const DELIBERATE_CONSENT_PERMISSIONS: readonly string[] = ["keys", "machines"];

/** The requested account permissions the consent screen starts with ticked. */
export function getPreselectedConsentPermissions(
    permissions: string[] | null | undefined,
): string[] | null {
    const preselected = sanitizeAuthorizeAccountPermissions(
        permissions,
    )?.filter(
        (permission) => !DELIBERATE_CONSENT_PERMISSIONS.includes(permission),
    );
    return preselected?.length ? preselected : null;
}

/** A redirect to this computer, e.g. a local MCP client such as Claude Code. */
function isLoopbackRedirect(url: URL | null): boolean {
    return url?.protocol === "http:" && isLoopbackHostname(url.hostname);
}

/**
 * The requested permissions the consent screen offers. `keys` (account admin)
 * is only offered in the device flow (polli) and on redirects to this computer
 * (local MCP clients such as Claude Code): a phished link that redirects to a
 * website must never get it.
 */
export function getConsentPermissionChoices(
    requested: ReadonlySet<string>,
    isDeviceFlow: boolean,
    redirectUrl: URL | null,
): string[] {
    const offersKeys = isDeviceFlow || isLoopbackRedirect(redirectUrl);
    return CONSENT_PERMISSIONS.filter(
        (permission) =>
            requested.has(permission) && (offersKeys || permission !== "keys"),
    );
}

/**
 * Whether a grant link may add `keys` to an existing key. Same rule as the
 * consent screen: never to a key an app got by redirecting to a website. Keys
 * from polli's device login, the dashboard or the API have no redirect origin.
 */
export function canGrantKeysByLink(redirectOrigin: unknown): boolean {
    if (redirectOrigin === undefined) return true;
    return (
        typeof redirectOrigin === "string" &&
        isLoopbackRedirect(parseAuthorizeRedirectUrl(redirectOrigin))
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
        pollenBudget: Math.min(
            budget ?? DEFAULT_CONSENT_BUDGET,
            MAX_LINK_CONSENT_BUDGET,
        ),
        expiryDays: expiry ?? DEFAULT_CONSENT_EXPIRY_DAYS,
        accountPermissions: getPreselectedConsentPermissions(permissions),
    };
}
