import { getLogger } from "@logtape/logtape";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { mediaKeep } from "@shared/db/media-keep.ts";
import { ensureConfigured } from "@shared/logger.ts";
import { requestId } from "@shared/middleware/request-id.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import { R2_LIFECYCLE_TTL_MS } from "@shared/r2-storage.ts";
import { and, asc, eq, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import type { Env } from "@/env.ts";
import { authFromSnapshot } from "@/middleware/auth.ts";
import { logger } from "@/middleware/logger.ts";
import { requireAccountFunds } from "@/utils/generation-access.ts";
import { charge, loadPayer } from "./routes/e2b.ts";

// R2's storage price, in pollen (1 pollen ≈ $1) per GB-month.
const GB_MONTH = 0.015;
// Smaller files are billed as this size, like S3's infrequent-access classes,
// so tiny files are not kept for free.
const MIN_BILLED_BYTES = 128 * 1024;
// Renew once 15 paid days are left, so missed cron runs have time to retry.
const RENEW_WITHIN_MS = R2_LIFECYCLE_TTL_MS / 2;
// About 10 subrequests each; the sandbox keeper shares the run's limit.
const RENEWALS_PER_RUN = 50;

/**
 * Keeps media uploaded with `expiresAfter: "never"` (media.pollinations.ai).
 * Once 15 of a file's paid days are left, rewrites it so R2's 30 days start
 * over, and charges the key that uploaded it for the days that adds, like
 * the key's own request. The keep ends when the file is gone, or the key is
 * or can no longer pay; the file then expires like any other upload,
 * normally 15 to 30 days later.
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
    const paidUntil = new Date(now + R2_LIFECYCLE_TTL_MS);
    const end = async (id: string, why: string) => {
        log.info("Ending the keep of media {id}: {why}", { id, why });
        await db.delete(mediaKeep).where(eq(mediaKeep.id, id));
    };
    const keep = async (row: typeof mediaKeep.$inferSelect) => {
        const payer = await loadPayer(env, row.apiKeyId);
        if (!payer) return end(row.id, "its key is gone");
        const months =
            (paidUntil.getTime() - row.paidUntil.getTime()) /
            R2_LIFECYCLE_TTL_MS;
        const price = roundPollenLedgerAmount(
            (Math.max(row.size, MIN_BILLED_BYTES) / 1e9) * GB_MONTH * months,
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
                // Only one renewal is charged: an overlapping cron run may
                // have renewed the row, or a DELETE removed it, since it was
                // read.
                const claimed = await db
                    .update(mediaKeep)
                    .set({ paidUntil })
                    .where(
                        and(
                            eq(mediaKeep.id, row.id),
                            eq(mediaKeep.paidUntil, row.paidUntil),
                        ),
                    );
                if (!claimed.meta.changes) return c.body(null, 204);
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
