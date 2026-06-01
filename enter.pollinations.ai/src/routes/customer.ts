import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { balance } from "../middleware/balance.ts";
import {
    fetchTinybirdRows,
    requireTinybirdReadToken,
    resolveUsageTargetUserId,
} from "./account.ts";

type EarningsTodayRow = {
    paid_week: number;
    tier_week: number;
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
            const token = requireTinybirdReadToken(c.env);
            const { userId: devUserId } = resolveUsageTargetUserId(
                c.env,
                user.id,
                c.var.auth.apiKey,
            );
            const origin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
            let rows: EarningsTodayRow[];
            try {
                rows = await fetchTinybirdRows<EarningsTodayRow>(
                    origin,
                    "/v0/pipes/developer_earnings_today.json",
                    token,
                    { dev_user_id: devUserId },
                );
            } catch (error) {
                throw new HTTPException(502, {
                    message:
                        error instanceof Error ? error.message : String(error),
                });
            }
            const row = rows[0];
            return c.json({
                paidWeek: row?.paid_week ?? 0,
                tierWeek: row?.tier_week ?? 0,
            });
        },
    );
