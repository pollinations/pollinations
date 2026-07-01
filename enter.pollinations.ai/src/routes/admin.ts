import { getLogger } from "@logtape/logtape";
import { communityModelId } from "@shared/community-endpoints.ts";
import {
    communityEndpoint as communityEndpointTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { sendTierEventToTinybird } from "@shared/events.ts";
import {
    getTierPollen,
    isValidTier,
    type TierName,
} from "@shared/tier-config.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";
import { runD1TinybirdSync } from "../services/d1-tinybird-sync.ts";
import { runScheduledTasks } from "../services/scheduled-tasks.ts";
import { runTierRefill } from "../services/tier-refill.ts";

const log = getLogger(["hono", "admin"]);

export const adminRoutes = new Hono<Env>()
    .use("*", async (c, next) => {
        const authHeader = c.req.header("Authorization");
        const providedKey = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;

        if (!providedKey) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        // Full admin token has access to all endpoints
        if (providedKey === c.env.PLN_ENTER_TOKEN) {
            return await next();
        }

        // Tinybird sync token: authenticates the GH Action AND is used for Tinybird API calls
        const syncToken = c.env.TINYBIRD_SYNC_TOKEN;
        if (
            syncToken &&
            providedKey === syncToken &&
            c.req.path.endsWith("/trigger-d1-sync")
        ) {
            return await next();
        }

        // Community monitor token: scoped to the community-model health monitor
        // loop only (deactivate/reactivate/list) — narrower than PLN_ENTER_TOKEN
        // since it lives on a standing EC2 box.
        const monitorToken = c.env.COMMUNITY_MONITOR_TOKEN;
        if (
            monitorToken &&
            providedKey === monitorToken &&
            c.req.path.includes("/community-endpoints")
        ) {
            return await next();
        }

        throw new HTTPException(401, { message: "Unauthorized" });
    })
    .post("/update-tier", async (c) => {
        const body = await c.req.json<{ userId: string; tier: string }>();

        if (!body.userId) {
            throw new HTTPException(400, { message: "userId is required" });
        }
        if (!body.tier || !isValidTier(body.tier)) {
            throw new HTTPException(400, { message: "Valid tier is required" });
        }

        const targetTier = body.tier as TierName;
        const tierBalance = getTierPollen(targetTier);
        const db = drizzle(c.env.DB);

        // Get current tier before update for logging
        const [currentUser] = await db
            .select({ tier: userTable.tier })
            .from(userTable)
            .where(eq(userTable.id, body.userId));

        if (!currentUser) {
            throw new HTTPException(404, { message: "User not found" });
        }

        const previousTier = currentUser.tier;

        // Update tier and balance in D1
        const result = await db
            .update(userTable)
            .set({
                tier: targetTier,
                tierBalance,
                lastTierGrant: Date.now(),
            })
            .where(eq(userTable.id, body.userId))
            .returning({ id: userTable.id });

        if (result.length === 0) {
            throw new HTTPException(404, { message: "User not found" });
        }

        // Log tier change event to Tinybird
        c.executionCtx.waitUntil(
            sendTierEventToTinybird(
                {
                    event_type: "tier_change",
                    environment: c.env.ENVIRONMENT || "unknown",
                    user_id: body.userId,
                    tier: targetTier,
                    pollen_amount: tierBalance,
                },
                c.env.TINYBIRD_TIER_INGEST_URL,
                c.env.TINYBIRD_INGEST_TOKEN,
            ),
        );

        log.info(
            "Tier updated for user {userId} from {previousTier} to {tier} with balance {balance}",
            {
                userId: body.userId,
                previousTier,
                tier: targetTier,
                balance: tierBalance,
            },
        );

        return c.json({
            success: true,
            userId: body.userId,
            previousTier,
            tier: targetTier,
            tierBalance,
        });
    })
    .post("/trigger-refill", async (c) => {
        const result = await runTierRefill(c.env, c.executionCtx);
        return c.json(result);
    })
    .post("/trigger-scheduled", async (c) => {
        // Runs the exact same scheduled pipeline as the cron so it can be
        // kicked off by hand.
        const result = await runScheduledTasks(c.env, c.executionCtx);
        return c.json(result);
    })
    .post("/trigger-d1-sync", async (c) => {
        const syncToken = c.env.TINYBIRD_SYNC_TOKEN;
        if (!syncToken) {
            throw new HTTPException(500, {
                message: "TINYBIRD_SYNC_TOKEN not configured",
            });
        }

        const results = await runD1TinybirdSync(c.env.DB, syncToken);
        const hasErrors = results.some((r) => r.status === "error");

        return c.json(
            { success: !hasErrors, tables: results },
            hasErrors ? 207 : 200,
        );
    })
    .get("/community-endpoints", async (c) => {
        const db = drizzle(c.env.DB);
        const rows = await db
            .select({
                id: communityEndpointTable.id,
                name: communityEndpointTable.name,
                ownerGithubUsername: userTable.githubUsername,
                disabledAt: communityEndpointTable.disabledAt,
                disabledReason: communityEndpointTable.disabledReason,
            })
            .from(communityEndpointTable)
            .innerJoin(
                userTable,
                eq(communityEndpointTable.ownerUserId, userTable.id),
            );

        return c.json({
            data: rows
                .filter((row) => row.ownerGithubUsername)
                .map((row) => ({
                    id: row.id,
                    modelId: communityModelId(
                        row.ownerGithubUsername as string,
                        row.name,
                    ),
                    disabledAt: row.disabledAt,
                    disabledReason: row.disabledReason,
                })),
        });
    })
    .post("/community-endpoints/:id/deactivate", async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json<{
            reason?: string;
            disabledBy?: string;
        }>();
        if (!body.reason?.trim()) {
            throw new HTTPException(400, { message: "reason is required" });
        }

        const db = drizzle(c.env.DB);
        const [row] = await db
            .update(communityEndpointTable)
            .set({
                disabledAt: new Date(),
                disabledReason: body.reason.trim(),
                disabledBy: body.disabledBy?.trim() || "monitor",
                updatedAt: new Date(),
            })
            .where(eq(communityEndpointTable.id, id))
            .returning({
                id: communityEndpointTable.id,
                disabledAt: communityEndpointTable.disabledAt,
                disabledReason: communityEndpointTable.disabledReason,
                disabledBy: communityEndpointTable.disabledBy,
            });

        if (!row) {
            throw new HTTPException(404, {
                message: "Community endpoint not found",
            });
        }

        log.info("Community endpoint {id} deactivated: {reason}", {
            id: row.id,
            reason: row.disabledReason ?? "",
        });

        return c.json(row);
    })
    .post("/community-endpoints/:id/reactivate", async (c) => {
        const { id } = c.req.param();
        const db = drizzle(c.env.DB);
        const [row] = await db
            .update(communityEndpointTable)
            .set({
                disabledAt: null,
                disabledReason: null,
                disabledBy: null,
                updatedAt: new Date(),
            })
            .where(eq(communityEndpointTable.id, id))
            .returning({
                id: communityEndpointTable.id,
                disabledAt: communityEndpointTable.disabledAt,
            });

        if (!row) {
            throw new HTTPException(404, {
                message: "Community endpoint not found",
            });
        }

        log.info("Community endpoint {id} reactivated by maintainer", {
            id: row.id,
        });

        return c.json(row);
    });
