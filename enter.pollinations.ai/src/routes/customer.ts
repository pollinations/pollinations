import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { balance } from "../middleware/balance.ts";

type EarningsTodayRow = {
    paid_today: number;
    tier_today: number;
};

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
            tags: ["👤 Account"],
            description:
                "Get detailed balance breakdown for the current user (tier, pack).",
            hide: ({ c }) => c?.env.ENVIRONMENT === "production", // Internal endpoint
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { tierBalance, packBalance } = await c.var.balance.getBalance(
                user.id,
            );
            const db = drizzle(c.env.DB);
            const users = await db
                .select({
                    lastTierGrant: userTable.lastTierGrant,
                })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);
            const lastTierGrant = users[0]?.lastTierGrant ?? null;

            return c.json({
                tierBalance,
                packBalance,
                lastTierGrant,
            });
        },
    )
    .get(
        "/balance/today",
        describeRoute({
            tags: ["👤 Account"],
            description:
                "Today's BYOP markup earnings split by which balance the spending user paid from. UTC calendar day.",
            hide: ({ c }) => c?.env.ENVIRONMENT === "production",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            if (!c.env.TINYBIRD_READ_TOKEN) {
                throw new HTTPException(500, {
                    message: "Tinybird read token is not configured",
                });
            }
            const url = new URL(
                "/v0/pipes/developer_earnings_today.json",
                new URL(c.env.TINYBIRD_INGEST_URL).origin,
            );
            url.searchParams.set("dev_user_id", user.id);
            const response = await fetch(url.toString(), {
                headers: {
                    Authorization: `Bearer ${c.env.TINYBIRD_READ_TOKEN}`,
                },
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new HTTPException(502, {
                    message: `Tinybird error: ${response.status} ${errorText || "(empty)"}`,
                });
            }
            const body = (await response.json()) as {
                data: EarningsTodayRow[];
            };
            const row = body.data[0];
            return c.json({
                paidToday: row?.paid_today ?? 0,
                tierToday: row?.tier_today ?? 0,
            });
        },
    );

export type CustomerRoutes = typeof customerRoutes;
