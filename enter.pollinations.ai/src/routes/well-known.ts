import { CONSENT_PERMISSIONS } from "@shared/auth/authorize-config.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { DEVICE_CODE_GRANT } from "./oauth.ts";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 * Only the authorization-code (PKCE) and device grants are advertised; the
 * legacy fragment (#api_key=) flow intentionally never appears here.
 */
export const wellKnownRoutes = new Hono<Env>().get(
    "/oauth-authorization-server",
    (c) => {
        const origin = getPublicOrigin(c);
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
            service_documentation: `${origin}/api/docs`,
        });
    },
);
