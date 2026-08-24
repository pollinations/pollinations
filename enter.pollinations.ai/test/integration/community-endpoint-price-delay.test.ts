import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("community endpoint price/visibility delay", () => {
    it("queues a public price change and keeps the old price until the deadline passes", async () => {
        const { db } = await import("@/db/db.js");
        const { communityEndpoint } = await import("@/db/better-auth.ts");
        const { PRICE_CHANGE_DELAY_MS, parseListingPayload } = await import(
            "@shared/community-endpoints.ts"
        );

        const now = Date.now();
        const oldPayload = JSON.stringify({
            pricePerMillionInputTokens: 1,
            pricePerMillionOutputTokens: 1,
        });
        const newPayload = JSON.stringify({
            pricePerMillionInputTokens: 4,
            pricePerMillionOutputTokens: 4,
        });

        await db.insert(communityEndpoint).values({
            id: "delay-test",
            name: "delay-test",
            type: "proxy",
            visibility: "public",
            payload: oldPayload,
            pendingPayload: newPayload,
            pendingVisibility: "public",
            pendingAt: new Date(now),
        });

        const before = await db
            .select()
            .from(communityEndpoint)
            .where(sql`${communityEndpoint.id} = "delay-test"`);

        const pendingEffective =
            now - before[0].pendingAt!.getTime() < PRICE_CHANGE_DELAY_MS;
        expect(pendingEffective).toBe(true);

        const effective = parseListingPayload(
            "proxy",
            pendingEffective ? before[0].payload : before[0].pendingPayload!,
        );
        expect(effective?.pricePerMillionInputTokens).toBe(1);

        await db
            .update(communityEndpoint)
            .set({
                pendingAt: new Date(now - PRICE_CHANGE_DELAY_MS - 1),
            })
            .where(sql`${communityEndpoint.id} = "delay-test"`);

        const after = await db
            .select()
            .from(communityEndpoint)
            .where(sql`${communityEndpoint.id} = "delay-test"`);
        const nowEffective =
            Date.now() >= after[0].pendingAt!.getTime() + PRICE_CHANGE_DELAY_MS;
        expect(nowEffective).toBe(true);
        const effectiveAfter = parseListingPayload(
            "proxy",
            nowEffective ? after[0].pendingPayload! : after[0].payload,
        );
        expect(effectiveAfter?.pricePerMillionInputTokens).toBe(4);

        await db
            .delete(communityEndpoint)
            .where(sql`${communityEndpoint.id} = "delay-test"`);
    });
});
