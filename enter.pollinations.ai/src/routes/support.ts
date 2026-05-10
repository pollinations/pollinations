/**
 * Support read-only routes.
 *
 * Live D1 reads scoped to a dedicated bearer token (SUPPORT_READ_TOKEN).
 * Predefined queries only — no raw SQL, no writes.
 *
 * Sensitive columns NEVER returned: account.access_token, account.refresh_token,
 * account.id_token, account.password, apikey.key, session.token, verification.value,
 * device_code.device_code, device_code.user_code.
 */

import {
    account,
    apikey,
    questPayoutCredits,
    session,
    stripeCheckoutCredits,
    user,
} from "@shared/db/better-auth.ts";
import { count, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";

// Safe column projections — sensitive fields excluded at the SQL level.

const userCols = {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    role: user.role,
    banned: user.banned,
    banReason: user.banReason,
    banExpires: user.banExpires,
    githubId: user.githubId,
    githubUsername: user.githubUsername,
    tier: user.tier,
    tierBalance: user.tierBalance,
    packBalance: user.packBalance,
    lastTierGrant: user.lastTierGrant,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
};

const apikeyCols = {
    id: apikey.id,
    name: apikey.name,
    start: apikey.start,
    prefix: apikey.prefix,
    userId: apikey.userId,
    enabled: apikey.enabled,
    rateLimitEnabled: apikey.rateLimitEnabled,
    rateLimitTimeWindow: apikey.rateLimitTimeWindow,
    rateLimitMax: apikey.rateLimitMax,
    requestCount: apikey.requestCount,
    remaining: apikey.remaining,
    refillInterval: apikey.refillInterval,
    refillAmount: apikey.refillAmount,
    lastRefillAt: apikey.lastRefillAt,
    lastRequest: apikey.lastRequest,
    expiresAt: apikey.expiresAt,
    permissions: apikey.permissions,
    metadata: apikey.metadata,
    pollenBalance: apikey.pollenBalance,
    byopClientKeyId: apikey.byopClientKeyId,
    createdAt: apikey.createdAt,
    updatedAt: apikey.updatedAt,
};

const sessionCols = {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    impersonatedBy: session.impersonatedBy,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
};

const accountCols = {
    id: account.id,
    accountId: account.accountId,
    providerId: account.providerId,
    userId: account.userId,
    scope: account.scope,
    accessTokenExpiresAt: account.accessTokenExpiresAt,
    refreshTokenExpiresAt: account.refreshTokenExpiresAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
};

export const supportRoutes = new Hono<Env>()
    .use("*", async (c, next) => {
        const authHeader = c.req.header("Authorization");
        const provided = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;

        const expected = c.env.SUPPORT_READ_TOKEN;
        if (!expected || !provided || provided !== expected) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        return await next();
    })
    // GET /user/:id — full user by ID
    .get("/user/:id", async (c) => {
        const db = drizzle(c.env.DB);
        const [row] = await db
            .select(userCols)
            .from(user)
            .where(eq(user.id, c.req.param("id")));
        if (!row) throw new HTTPException(404, { message: "User not found" });
        return c.json(row);
    })
    // GET /user/by-email/:email
    .get("/user/by-email/:email", async (c) => {
        const db = drizzle(c.env.DB);
        const [row] = await db
            .select(userCols)
            .from(user)
            .where(eq(user.email, c.req.param("email")));
        if (!row) throw new HTTPException(404, { message: "User not found" });
        return c.json(row);
    })
    // GET /user/by-github/:username
    .get("/user/by-github/:username", async (c) => {
        const db = drizzle(c.env.DB);
        const [row] = await db
            .select(userCols)
            .from(user)
            .where(eq(user.githubUsername, c.req.param("username")));
        if (!row) throw new HTTPException(404, { message: "User not found" });
        return c.json(row);
    })
    // GET /user/by-github-id/:id
    .get("/user/by-github-id/:id", async (c) => {
        const ghId = Number.parseInt(c.req.param("id"), 10);
        if (Number.isNaN(ghId)) {
            throw new HTTPException(400, { message: "Invalid github id" });
        }
        const db = drizzle(c.env.DB);
        const [row] = await db
            .select(userCols)
            .from(user)
            .where(eq(user.githubId, ghId));
        if (!row) throw new HTTPException(404, { message: "User not found" });
        return c.json(row);
    })
    // GET /user/:id/apikeys — keys for a user (no token values)
    .get("/user/:id/apikeys", async (c) => {
        const db = drizzle(c.env.DB);
        const rows = await db
            .select(apikeyCols)
            .from(apikey)
            .where(eq(apikey.userId, c.req.param("id")))
            .orderBy(desc(apikey.createdAt));
        return c.json({ keys: rows, count: rows.length });
    })
    // GET /user/:id/sessions — recent sessions (no token values)
    .get("/user/:id/sessions", async (c) => {
        const db = drizzle(c.env.DB);
        const rows = await db
            .select(sessionCols)
            .from(session)
            .where(eq(session.userId, c.req.param("id")))
            .orderBy(desc(session.createdAt))
            .limit(50);
        return c.json({ sessions: rows, count: rows.length });
    })
    // GET /user/:id/accounts — connected OAuth providers (no token values)
    .get("/user/:id/accounts", async (c) => {
        const db = drizzle(c.env.DB);
        const rows = await db
            .select(accountCols)
            .from(account)
            .where(eq(account.userId, c.req.param("id")));
        return c.json({ accounts: rows, count: rows.length });
    })
    // GET /user/:id/payments — stripe checkouts
    .get("/user/:id/payments", async (c) => {
        const db = drizzle(c.env.DB);
        const rows = await db
            .select()
            .from(stripeCheckoutCredits)
            .where(eq(stripeCheckoutCredits.userId, c.req.param("id")))
            .orderBy(desc(stripeCheckoutCredits.createdAt));
        const totalPollen = rows.reduce(
            (sum, r) => sum + (r.pollenCredited ?? 0),
            0,
        );
        return c.json({
            payments: rows,
            count: rows.length,
            totalPollenCredited: totalPollen,
        });
    })
    // GET /user/:id/quest-payouts
    .get("/user/:id/quest-payouts", async (c) => {
        const db = drizzle(c.env.DB);
        const rows = await db
            .select()
            .from(questPayoutCredits)
            .where(eq(questPayoutCredits.userId, c.req.param("id")))
            .orderBy(desc(questPayoutCredits.createdAt));
        const totalPollen = rows.reduce(
            (sum, r) => sum + (r.pollenCredited ?? 0),
            0,
        );
        return c.json({
            payouts: rows,
            count: rows.length,
            totalPollenCredited: totalPollen,
        });
    })
    // GET /user/:id/full — user + keys + accounts + payments in one call
    .get("/user/:id/full", async (c) => {
        const db = drizzle(c.env.DB);
        const userId = c.req.param("id");

        const [userRow] = await db
            .select(userCols)
            .from(user)
            .where(eq(user.id, userId));
        if (!userRow) {
            throw new HTTPException(404, { message: "User not found" });
        }

        const [keys, accounts, sessions, payments, questPayouts] =
            await Promise.all([
                db
                    .select(apikeyCols)
                    .from(apikey)
                    .where(eq(apikey.userId, userId))
                    .orderBy(desc(apikey.createdAt)),
                db
                    .select(accountCols)
                    .from(account)
                    .where(eq(account.userId, userId)),
                db
                    .select(sessionCols)
                    .from(session)
                    .where(eq(session.userId, userId))
                    .orderBy(desc(session.createdAt))
                    .limit(20),
                db
                    .select()
                    .from(stripeCheckoutCredits)
                    .where(eq(stripeCheckoutCredits.userId, userId))
                    .orderBy(desc(stripeCheckoutCredits.createdAt)),
                db
                    .select()
                    .from(questPayoutCredits)
                    .where(eq(questPayoutCredits.userId, userId))
                    .orderBy(desc(questPayoutCredits.createdAt)),
            ]);

        return c.json({
            user: userRow,
            apiKeys: keys,
            accounts,
            sessions,
            payments,
            questPayouts,
        });
    })
    // GET /apikey/:id — single key by ID (no token value)
    .get("/apikey/:id", async (c) => {
        const db = drizzle(c.env.DB);
        const [row] = await db
            .select(apikeyCols)
            .from(apikey)
            .where(eq(apikey.id, c.req.param("id")));
        if (!row) throw new HTTPException(404, { message: "Key not found" });
        return c.json(row);
    })
    // GET /apikey/by-prefix/:prefix — find key by user-visible prefix (e.g. "sk_abc")
    .get("/apikey/by-prefix/:prefix", async (c) => {
        const db = drizzle(c.env.DB);
        const rows = await db
            .select(apikeyCols)
            .from(apikey)
            .where(eq(apikey.start, c.req.param("prefix")))
            .limit(50);
        return c.json({ keys: rows, count: rows.length });
    })
    // GET /stats — high-level counts for dashboards
    .get("/stats", async (c) => {
        const db = drizzle(c.env.DB);
        const [totals] = await db
            .select({
                userCount: count(user.id),
                bannedCount: sql<number>`sum(case when ${user.banned} then 1 else 0 end)`,
            })
            .from(user);

        const tierBreakdown = await db
            .select({
                tier: user.tier,
                count: count(user.id),
                avgTierBalance: sql<number>`avg(${user.tierBalance})`,
                avgPackBalance: sql<number>`avg(${user.packBalance})`,
            })
            .from(user)
            .groupBy(user.tier);

        const [keyStats] = await db
            .select({
                keyCount: count(apikey.id),
                enabledCount: sql<number>`sum(case when ${apikey.enabled} then 1 else 0 end)`,
            })
            .from(apikey);

        return c.json({
            users: totals,
            keys: keyStats,
            byTier: tierBreakdown,
        });
    });
