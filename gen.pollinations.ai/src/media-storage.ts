import { getLogger } from "@logtape/logtape";
import { mediaStorageLease } from "@shared/billing/media-storage.ts";
import { mediaStorage } from "@shared/db/media-storage.ts";
import { ensureConfigured } from "@shared/logger.ts";
import { requestId } from "@shared/middleware/request-id.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import { R2_LIFECYCLE_TTL_MS } from "@shared/r2-storage.ts";
import { and, asc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import type { Env } from "@/env.ts";
import { authFromSnapshot } from "@/middleware/auth.ts";
import { logger } from "@/middleware/logger.ts";
import { requireAccountFunds } from "@/utils/generation-access.ts";
import { charge, loadPayer } from "./routes/e2b.ts";

// "never" files renew once 15 paid days are left, so missed cron runs have
// time to retry.
const RENEW_WITHIN_MS = R2_LIFECYCLE_TTL_MS / 2;
// About 10 subrequests per renewal; the sandbox keeper shares the run's limit.
const ROWS_PER_RUN = 50;

/**
 * Settles media uploaded with a user's API key (media.pollinations.ai),
 * which is paid in advance. A row with `renewTo` is a period waiting to be
 * paid: an upload's first, a fetch in a file's last 15 paid days, or the
 * next one of a "never" file. The cron charges the key that uploaded the
 * file, like its own request, and rewrites the file if R2 would delete it
 * sooner. A key that can't pay, or is gone, gets no more renewals, and
 * files whose paid time is over are deleted.
 */
export async function settleMediaStorage(
    env: CloudflareBindings,
    ctx: ExecutionContext,
) {
    await ensureConfigured({
        level: env.LOG_LEVEL || "debug",
        format: env.LOG_FORMAT || "text",
    });
    const log = getLogger(["gen", "media-storage"]);
    const db = drizzle(env.DB);
    const now = Date.now();

    await db
        .update(mediaStorage)
        .set({ renewTo: new Date(now + R2_LIFECYCLE_TTL_MS) })
        .where(
            and(
                eq(mediaStorage.expiresAfter, "never"),
                isNull(mediaStorage.renewTo),
                lte(mediaStorage.paidUntil, new Date(now + RENEW_WITHIN_MS)),
            ),
        );

    const renew = async (row: typeof mediaStorage.$inferSelect) => {
        if (!row.renewTo) return;
        const renewTo = row.renewTo;
        const unpaid = and(
            eq(mediaStorage.id, row.id),
            eq(mediaStorage.paidUntil, row.paidUntil),
            eq(mediaStorage.renewTo, renewTo),
        );
        // The file now ends when its paid time does.
        const end = async (why: string) => {
            log.info("Not renewing media {id}: {why}", { id: row.id, why });
            await db
                .update(mediaStorage)
                .set({ renewTo: null, expiresAfter: "created_at" })
                .where(unpaid);
        };
        const payer = await loadPayer(env, row.apiKeyId);
        if (!payer) return end("its key is gone");
        const lease = mediaStorageLease(
            row.size,
            renewTo.getTime() - row.paidUntil.getTime(),
        );
        const response = await new Hono<Env>()
            .use("*", requestId())
            .use("*", logger)
            .post("*", authFromSnapshot(payer), async (c) => {
                const startTime = new Date();
                await requireAccountFunds(c, lease.price);
                if (!(await c.env.MEDIA.refresh(row.id, renewTo))) {
                    return c.text("The file is gone", 404);
                }
                // Only one renewal is charged: an overlapping cron run may
                // have paid it, or a DELETE removed the row, since it was
                // read.
                const claimed = await db
                    .update(mediaStorage)
                    .set({ paidUntil: renewTo, renewTo: null })
                    .where(unpaid);
                if (!claimed.meta.changes) return c.body(null, 204);
                await charge(c, lease, startTime, {
                    eventType: "media.storage",
                    model: "media",
                    provider: "r2",
                });
                return c.body(null, 204);
            })
            .fetch(
                new Request(
                    `${PUBLIC_URLS.gen.production}/media/${row.id}/storage`,
                    { method: "POST" },
                ),
                env,
                ctx,
            );
        if (response.ok) return;
        const why = `${response.status} ${(await response.text()).slice(0, 300)}`;
        if (response.status === 404) {
            await db.delete(mediaStorage).where(unpaid);
            return;
        }
        // A key that can't pay gets no more renewals; anything else is
        // tried again next run.
        if ([402, 403].includes(response.status)) return end(why);
        log.info("Not renewing media {id} yet: {why}", { id: row.id, why });
    };
    // Files that are paid for come before new uploads, so a flood of
    // uploads can't hold their renewals back until R2 deletes them.
    const due = await db
        .select()
        .from(mediaStorage)
        .where(isNotNull(mediaStorage.renewTo))
        .orderBy(
            lte(mediaStorage.paidUntil, new Date(now)),
            asc(mediaStorage.paidUntil),
        )
        .limit(ROWS_PER_RUN);
    // One at a time, so each funds check sees the charge before it.
    for (const row of due) {
        await renew(row).catch((error) =>
            log.error("Renewing media {id} failed: {error}", {
                id: row.id,
                error: error instanceof Error ? error.message : String(error),
            }),
        );
    }

    // After the renewals, so a file whose first period could not be paid is
    // deleted in the same run.
    const over = await db
        .select()
        .from(mediaStorage)
        .where(
            and(
                isNull(mediaStorage.renewTo),
                lte(mediaStorage.paidUntil, new Date()),
            ),
        )
        .orderBy(asc(mediaStorage.paidUntil))
        .limit(ROWS_PER_RUN);
    await Promise.all(
        over.map(async (row) => {
            try {
                // The row first: if it changed since it was read (a new
                // upload under the same custom id), the file stays.
                const deleted = await db
                    .delete(mediaStorage)
                    .where(
                        and(
                            eq(mediaStorage.id, row.id),
                            eq(mediaStorage.paidUntil, row.paidUntil),
                            isNull(mediaStorage.renewTo),
                        ),
                    );
                if (deleted.meta.changes) await env.MEDIA.delete(row.id);
            } catch (error) {
                log.error("Deleting media {id} failed: {error}", {
                    id: row.id,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }),
    );
}
