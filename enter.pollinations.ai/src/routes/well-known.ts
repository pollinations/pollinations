import { CONSENT_PERMISSIONS } from "@shared/auth/authorize-config.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { DEVICE_CODE_GRANT } from "./oauth.ts";

/**
 * Mirror of getCurrentGenOrigin in ../index.ts (duplicated to avoid a
 * route→app import cycle): force https and map enter.* → gen.* so
 * staging/dev resolve to their gen counterparts, never back to enter.
 */
function getCurrentGenOrigin(c: Context<Env>): string {
    const url = new URL(getPublicOrigin(c));
    url.protocol = "https:";
    url.hostname = url.hostname.replace(/(^|\.)enter\./, "$1gen.");
    return url.origin;
}

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 * Only the authorization-code (PKCE) and device grants are advertised; the
 * legacy fragment (#api_key=) flow intentionally never appears here.
 */
export const wellKnownRoutes = new Hono<Env>()
    .get("/oauth-authorization-server", (c) => {
        const origin = getPublicOrigin(c);
        const genOrigin = getCurrentGenOrigin(c);
        // Static per origin — let the CDN/browser absorb repeat fetches.
        c.header("Cache-Control", "public, max-age=3600");
        return c.json({
            issuer: origin,
            authorization_endpoint: `${origin}/authorize`,
            token_endpoint: `${origin}/api/oauth/token`,
            userinfo_endpoint: `${origin}/api/oauth/userinfo`,
            device_authorization_endpoint: `${origin}/api/device/code`,
            scopes_supported: [...CONSENT_PERMISSIONS],
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", DEVICE_CODE_GRANT],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
            // RFC 8414 imposes no same-origin requirement: point agents at
            // the final docs destination on gen. (The legacy enter
            // /api/docs → gen /docs redirect in index.ts stays untouched as
            // a separate compatibility contract.)
            service_documentation: `${genOrigin}/docs`,
        });
    })
    .get("/api-catalog", (c) => {
        // Permanent cross-service delegation to gen's RFC 9727 catalog.
        // 308 preserves the request method; public discovery metadata, so
        // no authentication.
        return c.redirect(
            `${getCurrentGenOrigin(c)}/.well-known/api-catalog`,
            308,
        );
    });
