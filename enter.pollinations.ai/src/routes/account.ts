import { user as userTable } from "@/db/schema/better-auth.ts";
import { getPendingSpend } from "@/events.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { polar } from "../middleware/polar.ts";

/**
 * Response schema for the account balance endpoint.
 * Includes tier vs pack breakdown and total balance.
 */
const BalanceResponseSchema = z.object({
    tierBalance: z
        .number()
        .describe("Pollen balance from subscription tier allowance"),
    packBalance: z
        .number()
        .describe("Pollen balance from purchased pollen packs"),
    totalBalance: z
        .number()
        .describe("Total available pollen (tierBalance + packBalance)"),
    pendingSpend: z
        .number()
        .describe("Pollen from recent requests not yet fully processed (deducted from effectiveBalance)"),
    effectiveBalance: z
        .number()
        .describe("Actual spendable pollen (totalBalance - pendingSpend)"),
    lastTierGrant: z
        .number()
        .nullable()
        .describe("Unix timestamp (seconds) of last tier balance grant, or null if never granted"),
});

export type BalanceResponse = z.infer<typeof BalanceResponseSchema>;

/**
 * Public account routes for API consumers.
 * Authenticated via API key only (Bearer token or ?key= query param).
 */
export const accountRoutes = new Hono<Env>()
    .use("*", auth({ allowApiKey: true, allowSessionCookie: false }))
    .use("*", polar)
    .get(
        "/balance",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            summary: "Get account pollen balance",
            description: [
                "Returns the current pollen balance for the authenticated account.",
                "Includes breakdown of tier allowance vs purchased packs.",
            ].join(" "),
            responses: {
                200: {
                    description: "Account balance retrieved successfully",
                    content: {
                        "application/json": {
                            schema: resolver(BalanceResponseSchema),
                        },
                    },
                },
                401: {
                    description: "Missing or invalid API key",
                },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB);

            // Get balances and pending spend in parallel
            const [balances, pendingSpend, userRecord] = await Promise.all([
                c.var.polar.getBalance(user.id),
                getPendingSpend(db, user.id),
                db
                    .select({ lastTierGrant: userTable.lastTierGrant })
                    .from(userTable)
                    .where(eq(userTable.id, user.id))
                    .limit(1),
            ]);

            const { tierBalance, packBalance } = balances;
            const totalBalance = tierBalance + packBalance;
            const effectiveBalance = Math.max(0, totalBalance - pendingSpend);
            const lastTierGrant = userRecord[0]?.lastTierGrant ?? null;

            return c.json({
                tierBalance,
                packBalance,
                totalBalance,
                pendingSpend,
                effectiveBalance,
                lastTierGrant,
            } satisfies BalanceResponse);
        },
    );

export type AccountRoutes = typeof accountRoutes;
