import { getLogger } from "@logtape/logtape";
import { user as userTable } from "@shared/db/better-auth.ts";
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
import { syncGithubMirror } from "../services/github-mirror.ts";
import { runQuestEvaluator } from "../services/quest-evaluator.ts";
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
    .post("/trigger-quest-evaluator", async (c) => {
        const result = await runQuestEvaluator(c.env);
        return c.json(result);
    })
    .post("/trigger-github-mirror", async (c) => {
        // syncGithubMirror logs its own per-table counts and returns void; the
        // call resolving without throwing is the success signal here.
        await syncGithubMirror(c.env);
        return c.json({ success: true });
    })
    .post("/trigger-scheduled", async (c) => {
        // Runs the exact same pipeline as the cron (mirror -> quest evaluator,
        // + tier refill) so it can be kicked off by hand.
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
    });
