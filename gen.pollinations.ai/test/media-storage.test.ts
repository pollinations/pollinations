import {
    createExecutionContext,
    createScheduledController,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { apikey } from "@shared/db/better-auth.ts";
import { mediaStorage } from "@shared/db/media-storage.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";
import worker from "../src/index.ts";

const DAY_MS = 86_400_000;
// Half of R2's storage price, in pollen per GB-month.
const GB_MONTH = 0.0075;
// Smaller files are billed as this size.
const MIN_BILLED_BYTES = 128 * 1024;

// Records the media storage charges sent to Tinybird; everything else goes
// to the real fetch.
function stubTinybird() {
    const events: Record<string, unknown>[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
        const request = new Request(input, init);
        const tinybird = new URL(env.TINYBIRD_INGEST_URL).origin;
        if (new URL(request.url).origin === tinybird) {
            events.push(JSON.parse(await request.text()));
            return new Response(null, { status: 202 });
        }
        return realFetch(input, init);
    });
    return () => events.filter((event) => event.eventType === "media.storage");
}

const upload = (size: number) =>
    env.MEDIA.upload(new Blob([new Uint8Array(size)]).stream(), {
        contentType: "application/octet-stream",
        size,
    });

const questPollen = async (userId: string) =>
    (await getUserBalance(drizzle(env.DB), userId)).tierBalance;

const inDays = (days: number, from = Date.now()) =>
    new Date(from + days * DAY_MS);

// Within a minute: D1 stores these timestamps in seconds, and the cron
// takes its own time.
const expectAbout = (actual: Date | null | undefined, expected: Date) =>
    expect(
        Math.abs((actual?.getTime() ?? 0) - expected.getTime()),
    ).toBeLessThan(60_000);

afterEach(() => {
    vi.unstubAllGlobals();
});

test("the cron charges each waiting period once even when runs overlap, renews never files with 15 paid days left, stops renewing what a key can't pay, and deletes files whose paid time is over", async () => {
    const charges = stubTinybird();
    const db = drizzle(env.DB);
    const owner = await createTestApiKey({ user: { tierBalance: 10 } });
    const broke = await createTestApiKey({ user: { tierBalance: 0 } });
    const revoked = await createTestApiKey({ user: { tierBalance: 10 } });
    await db
        .update(apikey)
        .set({ enabled: false })
        .where(eq(apikey.id, revoked.id));

    const size = 10_000_000;
    const start = new Date();
    const [
        first,
        fixed,
        hour,
        kept,
        keptLater,
        fetched,
        unpaid,
        unrenewed,
        over,
    ] = await Promise.all([
        upload(size),
        ...Array.from({ length: 8 }, () => upload(1000)),
    ]);
    const keptLaterPaidUntil = inDays(20);
    const row = (
        id: string,
        apiKeyId: string,
        expiresAfter: "last_active_at" | "created_at" | "never",
        paidUntil: Date,
        renewTo: Date | null,
    ) => ({ id, apiKeyId, size: 1000, expiresAfter, paidUntil, renewTo });
    await db.insert(mediaStorage).values([
        // Just uploaded: the first 30 days, and one day for a fixed expiry.
        {
            ...row(first.id, owner.id, "last_active_at", start, null),
            size,
            renewTo: inDays(30, start.getTime()),
        },
        row(
            fixed.id,
            owner.id,
            "created_at",
            start,
            inDays(1, start.getTime()),
        ),
        row(
            hour.id,
            owner.id,
            "created_at",
            start,
            inDays(1 / 24, start.getTime()),
        ),
        // Never files renew with 15 paid days left.
        row(kept.id, owner.id, "never", inDays(10), null),
        row(keptLater.id, owner.id, "never", keptLaterPaidUntil, null),
        // Fetched in its last 15 paid days.
        row(fetched.id, owner.id, "last_active_at", inDays(10), inDays(30)),
        row("gone", owner.id, "last_active_at", inDays(10), inDays(30)),
        row(unpaid.id, broke.id, "last_active_at", start, inDays(30)),
        row(unrenewed.id, revoked.id, "never", inDays(10), null),
        row(over.id, owner.id, "created_at", inDays(-0.01), null),
    ]);

    // Two overlapping runs read the same rows.
    const ctx = createExecutionContext();
    await Promise.all([
        worker.scheduled(createScheduledController(), env, ctx),
        worker.scheduled(createScheduledController(), env, ctx),
    ]);
    await waitOnExecutionContext(ctx);

    const rows = new Map(
        (await db.select().from(mediaStorage)).map((row) => [row.id, row]),
    );
    // Deleted: the gone file's row, the upload its key couldn't pay for, and
    // the file whose paid time is over.
    expect([...rows.keys()].sort()).toEqual(
        [
            first.id,
            fixed.id,
            hour.id,
            kept.id,
            keptLater.id,
            fetched.id,
            unrenewed.id,
        ].sort(),
    );
    expect(await env.MEDIA.has(unpaid.id)).toBe(false);
    expect(await env.MEDIA.has(over.id)).toBe(false);
    expect(await env.MEDIA.has(kept.id)).toBe(true);
    for (const row of rows.values()) expect(row.renewTo).toBeNull();
    expectAbout(rows.get(first.id)?.paidUntil, inDays(30, start.getTime()));
    expectAbout(rows.get(fixed.id)?.paidUntil, inDays(1, start.getTime()));
    expectAbout(rows.get(kept.id)?.paidUntil, inDays(30));
    expectAbout(rows.get(keptLater.id)?.paidUntil, keptLaterPaidUntil);
    expectAbout(rows.get(fetched.id)?.paidUntil, inDays(30));
    // A key that can't pay gets no more renewals: the file ends when its
    // paid time does.
    expect(rows.get(unrenewed.id)).toMatchObject({
        expiresAfter: "created_at",
    });
    expectAbout(rows.get(unrenewed.id)?.paidUntil, inDays(10));

    // Each period is charged once, in advance, at half of R2's price; the
    // 1 KB files are billed as 128 KiB, and the hour costs the ledger's
    // smallest unit.
    const price = (bytes: number, days: number) =>
        (bytes / 1e9) * GB_MONTH * (days / 30);
    const prices = charges()
        .map((event) => Number(event.totalPrice))
        .sort((a, b) => a - b);
    const expected = [
        1e-8,
        price(MIN_BILLED_BYTES, 1),
        price(MIN_BILLED_BYTES, 20),
        price(MIN_BILLED_BYTES, 20),
        price(size, 30),
    ];
    expect(prices).toHaveLength(expected.length);
    expected.forEach((value, i) => {
        expect(prices[i]).toBeCloseTo(value, 8);
    });
    for (const event of charges()) {
        expect(event).toMatchObject({
            userId: owner.userId,
            apiKeyId: owner.id,
            modelUsed: "media",
            modelProviderUsed: "r2",
        });
    }
    // Each charge is rounded to the ledger's 1e-8.
    expect(await questPollen(owner.userId)).toBeCloseTo(
        10 - expected.reduce((sum, value) => sum + value, 0),
        7,
    );
    expect(await questPollen(broke.userId)).toBe(0);
    expect(await questPollen(revoked.userId)).toBe(10);
});

test("renewals of paid files go before a backlog of new uploads", async () => {
    const db = drizzle(env.DB);
    const owner = await createTestApiKey({ user: { tierBalance: 10 } });
    const kept = await upload(1000);
    const start = new Date();
    // A full run's worth of uploads waiting for their first period.
    for (let i = 0; i < 50; i++) {
        await db.insert(mediaStorage).values({
            id: `new-${i}`,
            apiKeyId: owner.id,
            size: 1000,
            expiresAfter: "last_active_at",
            paidUntil: start,
            renewTo: inDays(30, start.getTime()),
        });
    }
    await db.insert(mediaStorage).values({
        id: kept.id,
        apiKeyId: owner.id,
        size: 1000,
        expiresAfter: "never",
        paidUntil: inDays(10),
        renewTo: inDays(30),
    });

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), env, ctx);
    await waitOnExecutionContext(ctx);

    const [row] = await db
        .select()
        .from(mediaStorage)
        .where(eq(mediaStorage.id, kept.id));
    expectAbout(row.paidUntil, inDays(30));
    expect(row.renewTo).toBeNull();
});
