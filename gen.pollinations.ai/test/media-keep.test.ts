import {
    createExecutionContext,
    createScheduledController,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { apikey } from "@shared/db/better-auth.ts";
import { mediaKeep } from "@shared/db/media-keep.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";
import worker from "../src/index.ts";

const DAY_MS = 86_400_000;
// R2's storage price, in pollen per GB-month.
const GB_MONTH = 0.015;

// Records the media keep charges sent to Tinybird; everything else goes to
// the real fetch.
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
    return () => events.filter((event) => event.eventType === "media.keep");
}

const upload = (size: number) =>
    env.MEDIA.upload(new Blob([new Uint8Array(size)]).stream(), {
        contentType: "application/octet-stream",
        size,
    });

const questPollen = async (userId: string) =>
    (await getUserBalance(drizzle(env.DB), userId)).tierBalance;

const inDays = (days: number) => new Date(Date.now() + days * DAY_MS);

afterEach(() => {
    vi.unstubAllGlobals();
});

test("the cron renews kept media with 15 paid days left at R2's price, and ends a keep its key can't pay or whose file is gone", async () => {
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
    const due = await upload(size);
    const later = await upload(1000);
    const unpaid = await upload(1000);
    const orphaned = await upload(1000);
    const laterPaidUntil = inDays(20);
    await db.insert(mediaKeep).values([
        { id: due.id, apiKeyId: owner.id, size, paidUntil: inDays(10) },
        {
            id: later.id,
            apiKeyId: owner.id,
            size: 1000,
            paidUntil: laterPaidUntil,
        },
        { id: "gone", apiKeyId: owner.id, size: 1000, paidUntil: inDays(10) },
        {
            id: unpaid.id,
            apiKeyId: broke.id,
            size: 1000,
            paidUntil: inDays(10),
        },
        {
            id: orphaned.id,
            apiKeyId: revoked.id,
            size: 1000,
            paidUntil: inDays(10),
        },
    ]);

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), env, ctx);
    await waitOnExecutionContext(ctx);

    // Kept on: the renewed and the not yet due; ended: the gone file, and
    // those whose key can't pay or is revoked.
    const keeps = new Map(
        (await db.select().from(mediaKeep)).map((keep) => [keep.id, keep]),
    );
    expect([...keeps.keys()].sort()).toEqual([due.id, later.id].sort());
    expect(
        (keeps.get(due.id)?.paidUntil.getTime() ?? 0) - Date.now(),
    ).toBeGreaterThan(29.99 * DAY_MS);
    expect(
        Math.abs(
            (keeps.get(later.id)?.paidUntil.getTime() ?? 0) -
                laterPaidUntil.getTime(),
        ),
    ).toBeLessThan(1000);
    expect(await env.MEDIA.has(due.id)).toBe(true);

    // The renewal pays for the 20 days it adds to 10 MB.
    const price = (size / 1e9) * GB_MONTH * (20 / 30);
    expect(charges()).toHaveLength(1);
    expect(charges()[0]).toMatchObject({
        userId: owner.userId,
        apiKeyId: owner.id,
        modelUsed: "media",
        modelProviderUsed: "r2",
    });
    expect(charges()[0].totalPrice).toBeCloseTo(price, 6);
    expect(await questPollen(owner.userId)).toBeCloseTo(10 - price, 6);
    expect(await questPollen(broke.userId)).toBe(0);
    expect(await questPollen(revoked.userId)).toBe(10);
});
