import { getLogger } from "@logtape/logtape";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { mediaKeep } from "@shared/db/media-keep.ts";
import { ensureConfigured } from "@shared/logger.ts";
import { requestId } from "@shared/middleware/request-id.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import { asc, eq, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import type { Env } from "@/env.ts";
import { authFromSnapshot } from "@/middleware/auth.ts";
import { logger } from "@/middleware/logger.ts";
import { requireAccountFunds } from "@/utils/generation-access.ts";
import { charge, loadPayer } from "./routes/e2b.ts";

// R2's storage price, in pollen (1 pollen ≈ $1) per GB-month.
const GB_MONTH = 0.015;
const DAY_MS = 24 * 60 * 60 * 1000;
// R2 deletes a media file 30 days after it was last written.
const LIFETIME_MS = 30 * DAY_MS;
// Renew once 15 paid days are left, so missed cron runs have time to retry.
const RENEW_WITHIN_MS = 15 * DAY_MS;
// About 10 subrequests each, well under a cron run's limit.
const RENEWALS_PER_RUN = 50;

/**
 * Keeps media uploaded with `expiresAfter: "never"` (media.pollinations.ai).
 * Once 15 of a file's paid days are left, rewrites it so R2's 30 days start
 * over, and charges the key that uploaded it for the days that adds, like
 * the key's own request. The keep ends when the file is gone, or the key is
 * or can no longer pay; the file then expires like any other upload, 15 or
 * more days later.
 */
export async function keepMedia(
    env: CloudflareBindings,
    ctx: ExecutionContext,
) {
    await ensureConfigured({
        level: env.LOG_LEVEL || "debug",
        format: env.LOG_FORMAT || "text",
    });
    const log = getLogger(["gen", "media-keeper"]);
    const db = drizzle(env.DB);
    const now = Date.now();
    const paidUntil = new Date(now + LIFETIME_MS);
    const end = async (id: string, why: string) => {
        log.info("Ending the keep of media {id}: {why}", { id, why });
        await db.delete(mediaKeep).where(eq(mediaKeep.id, id));
    };
    const keep = async (row: typeof mediaKeep.$inferSelect) => {
        const payer = await loadPayer(env, row.apiKeyId);
        if (!payer) return end(row.id, "its key is gone");
        const months =
            (paidUntil.getTime() - row.paidUntil.getTime()) / LIFETIME_MS;
        const price = roundPollenLedgerAmount(
            (row.size / 1e9) * GB_MONTH * months,
        );
        const response = await new Hono<Env>()
            .use("*", requestId())
            .use("*", logger)
            .post("*", authFromSnapshot(payer), async (c) => {
                const startTime = new Date();
                await requireAccountFunds(c, price);
                if (!(await c.env.MEDIA.refresh(row.id))) {
                    return c.text("The file is gone", 404);
                }
                await db
                    .update(mediaKeep)
                    .set({ paidUntil })
                    .where(eq(mediaKeep.id, row.id));
                if (price > 0) {
                    await charge(c, { cost: price, price }, startTime, {
                        eventType: "media.keep",
                        model: "media",
                        provider: "r2",
                    });
                }
                return c.body(null, 204);
            })
            .fetch(
                new Request(
                    `${PUBLIC_URLS.gen.production}/media/${row.id}/keep`,
                    { method: "POST" },
                ),
                env,
                ctx,
            );
        if (response.ok) return;
        const why = `${response.status} ${(await response.text()).slice(0, 300)}`;
        // A key that cannot pay, or a file that is gone, ends the keep.
        // Anything else is tried again next time.
        if ([402, 403, 404].includes(response.status)) {
            return end(row.id, why);
        }
        log.info("Not renewing media {id}: {why}", { id: row.id, why });
    };
    const due = await db
        .select()
        .from(mediaKeep)
        .where(lte(mediaKeep.paidUntil, new Date(now + RENEW_WITHIN_MS)))
        .orderBy(asc(mediaKeep.paidUntil))
        .limit(RENEWALS_PER_RUN);
    await Promise.all(
        due.map((row) =>
            keep(row).catch((error) =>
                log.error("Keeping media {id} failed: {error}", {
                    id: row.id,
                    error:
                        error instanceof Error ? error.message : String(error),
                }),
            ),
        ),
    );
}
