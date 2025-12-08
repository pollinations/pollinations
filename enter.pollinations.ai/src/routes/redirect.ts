import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import type { Env } from "../env.ts";

export const redirectRoutes = new Hono<Env>()
    .post(
        "/store-redirect-secret",
        describeRoute({
            tags: ["Auth"],
            description: "Store a secret-to-session mapping for secure redirect flow",
            hide: true,
        }),
        async (c) => {
            // This endpoint requires session authentication
            const sessionHeader = c.req.header('cookie');
            if (!sessionHeader?.includes('better-auth.session_token')) {
                throw new HTTPException(401, { message: 'Unauthorized' });
            }

            const body = await c.req.json();
            const { secret, sessionId } = body as { secret: string; sessionId: string };

            if (!secret || !sessionId) {
                throw new HTTPException(400, { message: 'Missing secret or sessionId' });
            }

            // Store in KV with 5 minute expiration
            await c.env.KV.put(`redirect_secret:${secret}`, sessionId, {
                expirationTtl: 300, // 5 minutes
            });

            return c.json({ success: true });
        }
    );

export type RedirectRoutes = typeof redirectRoutes;
