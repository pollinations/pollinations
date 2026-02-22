import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { user as userTable } from "@/db/schema/better-auth.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { balance } from "../middleware/balance.ts";

/**
 * Customer routes - Internal endpoints for the frontend
 * These require session authentication and provide detailed user data
 */
export const customerRoutes = new Hono<Env>()
    .use("*", auth({ allowApiKey: false, allowSessionCookie: true }))
    .use("*", balance)
    .get(
        "/balance",
        describeRoute({
            tags: ["Customer"],
            description:
                "Get detailed balance breakdown for the current user (tier, pack, crypto).",
            hide: ({ c }) => c?.env.ENVIRONMENT === "production", // Internal endpoint
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { tierBalance, packBalance, cryptoBalance } =
                await c.var.balance.getBalance(user.id);
            const db = drizzle(c.env.DB);
            const users = await db
                .select({ lastTierGrant: userTable.lastTierGrant })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);
            const lastTierGrant = users[0]?.lastTierGrant ?? null;

            return c.json({
                tierBalance,
                packBalance,
                cryptoBalance,
                lastTierGrant,
            });
        },
    );

export type CustomerRoutes = typeof customerRoutes;
