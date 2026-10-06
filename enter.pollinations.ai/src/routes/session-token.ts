import {
    SESSION_TOKEN_TTL_SECONDS,
    signSessionToken,
} from "@shared/auth/session-token.ts";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

/**
 * Exchanges the dashboard's session cookie for a short-lived bearer token, so
 * the dashboard uses the same account API that apps call with their keys
 * through gen.pollinations.ai/account.
 */
export const sessionTokenRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    .post(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            description:
                "Mint a short-lived API token for the signed-in dashboard user.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const token = await signSessionToken({
                secret: c.env.BETTER_AUTH_SECRET,
                userId: user.id,
            });
            c.header("Cache-Control", "private, no-store, max-age=0");
            return c.json({ token, expiresIn: SESSION_TOKEN_TTL_SECONDS });
        },
    );
