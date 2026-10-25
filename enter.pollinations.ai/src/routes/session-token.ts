import {
    SESSION_TOKEN_TTL_SECONDS,
    signSessionToken,
} from "@shared/auth/session-token.ts";
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

/**
 * Exchanges the dashboard's session cookie for a short-lived bearer token, so
 * the dashboard uses the same account API that apps call with their keys
 * through gen.pollinations.ai/account.
 */
export const sessionTokenRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    .post("/", async (c) => {
        const user = c.var.auth.requireUser();
        const token = await signSessionToken({
            secret: c.env.BETTER_AUTH_SECRET,
            userId: user.id,
        });
        return c.json({ token, expiresIn: SESSION_TOKEN_TTL_SECONDS });
    });
