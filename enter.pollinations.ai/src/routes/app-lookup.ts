import { validator } from "@shared/middleware/validator.ts";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { resolveOAuthClient } from "../services/oauth-client.ts";
import { redirectUriMatchesAllowlist } from "./url-utils.ts";

/**
 * Public endpoint to resolve an app_key (client_id) to attribution info.
 * No auth required — used during the /authorize flow.
 *
 * Identity comes from client_id only. Redirect URLs are not used to infer
 * which app is calling: any developer can claim any URL by writing it into
 * their key's metadata, so URL-based attribution is not trustworthy.
 */
const AppLookupQuerySchema = z.object({
    client_id: z
        .string()
        .optional()
        .describe(
            "A registered publishable App Key (pk_...) or HTTPS Client ID Metadata Document URL.",
        ),
    app_key: z
        .string()
        .startsWith("pk_")
        .optional()
        .describe(
            "Legacy alias for `client_id`. Accepted for backwards compatibility.",
        ),
    redirect_uri: z
        .string()
        .optional()
        .describe(
            "OAuth redirect URI. When provided alongside client_id, validated against the key's registered allowlist; mismatches return { found: false } so attribution and a minted key cannot be delivered to a redirect the app didn't register (RFC 6749 §3.1.2).",
        ),
});

export const appLookupRoutes = new Hono<Env>().get(
    "/",
    describeRoute({
        tags: ["👤 Account"],
        description:
            "Look up app attribution by client_id. No auth required. Used during the /authorize BYOP flow to resolve the app name and author shown on the consent screen. Without a client_id the consent screen falls back to a hostname-only display.",
        hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
    }),
    validator("query", AppLookupQuerySchema),
    async (c) => {
        const {
            client_id: clientId,
            app_key: appKey,
            redirect_uri: redirectUri,
        } = c.req.valid("query");
        const resolvedAppKey = clientId ?? appKey;
        if (!resolvedAppKey) {
            return c.json({ found: false });
        }

        const auth = createAuth(c.env);
        const client = await resolveOAuthClient({
            db: c.env.DB,
            auth,
            clientId: resolvedAppKey,
        });
        if (client) {
            // Bind client_id to redirect_uri before delivering attribution.
            // Without this, the consent screen could brand a legitimate app
            // while delivering its token to an attacker-controlled callback.
            if (
                redirectUri &&
                !redirectUriMatchesAllowlist(redirectUri, client.redirectUris)
            ) {
                return c.json({
                    found: false as const,
                    error: "redirect_uri_mismatch" as const,
                });
            }
            return c.json({ found: true as const, ...client });
        }

        return c.json({ found: false });
    },
);
