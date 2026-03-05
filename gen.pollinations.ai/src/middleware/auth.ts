/**
 * Auth middleware for gen.pollinations.ai
 *
 * Instead of querying D1 directly, calls enter's /api/internal/verify
 * via service binding. Sets c.var.auth with the auth context.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthContext, Env } from "../env.ts";

export type AuthOptions = {
    required?: boolean;
};

export const auth = (options: AuthOptions = {}) =>
    createMiddleware<Env>(async (c, next) => {
        const authorization = c.req.header("authorization");
        const cookie = c.req.header("cookie");
        const keyParam = c.req.query("key");

        // Build authorization value from header or query param
        const authValue =
            authorization || (keyParam ? `Bearer ${keyParam}` : undefined);

        // If no auth credentials and auth not required, proceed without auth
        if (!authValue && !cookie) {
            if (options.required) {
                throw new HTTPException(401, {
                    message: "Authentication required",
                });
            }
            c.set("auth", {
                valid: false,
                hasPositiveBalance: false,
                hasPaidBalance: false,
            });
            await next();
            return;
        }

        // Call enter's internal verify endpoint via service binding
        const verifyResponse = await c.env.ENTER.fetch(
            new URL("/api/internal/verify", c.req.url),
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-enter-token": c.env.PLN_ENTER_TOKEN || "",
                },
                body: JSON.stringify({
                    authorization: authValue,
                    cookie,
                }),
            },
        );

        if (!verifyResponse.ok) {
            if (options.required) {
                throw new HTTPException(401, {
                    message: "Authentication failed",
                });
            }
            c.set("auth", {
                valid: false,
                hasPositiveBalance: false,
                hasPaidBalance: false,
            });
            await next();
            return;
        }

        const authContext = (await verifyResponse.json()) as AuthContext;

        if (!authContext.valid && options.required) {
            throw new HTTPException(401, { message: "Invalid credentials" });
        }

        c.set("auth", authContext);
        await next();
    });
