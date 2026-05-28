import {
    DEFAULT_R2_TTL_REFRESH_INTERVAL_MS,
    refreshR2ObjectTtl,
} from "@shared/r2-storage.ts";
import { createTestR2Bucket } from "@shared/test/mocks/r2.ts";
import { describe, expect, it } from "vitest";

describe("R2 storage helpers", () => {
    it("refreshes object TTL while preserving content and metadata", async () => {
        const bucket = createTestR2Bucket();
        await bucket.put("cache-key", "cached body", {
            httpMetadata: { contentType: "text/plain" },
            customMetadata: { cachedAt: "2026-05-28T00:00:00.000Z" },
        });

        const cached = await bucket.get("cache-key");
        expect(cached).not.toBeNull();
        if (!cached) throw new Error("Expected seeded R2 object");

        const pending: Promise<unknown>[] = [];
        const errors: unknown[] = [];
        const responseBody = refreshR2ObjectTtl(
            bucket,
            "cache-key",
            cached,
            (promise) => pending.push(promise),
            (error) => errors.push(error),
        );

        expect(await new Response(responseBody).text()).toBe("cached body");
        await Promise.all(pending);

        const refreshed = bucket.getObject("cache-key");
        expect(errors).toEqual([]);
        expect(bucket.putCount).toBe(2);
        expect(refreshed?.uploaded.getTime()).toBe(2);
        expect(refreshed?.httpMetadata?.contentType).toBe("text/plain");
        expect(refreshed?.customMetadata?.cachedAt).toBe(
            "2026-05-28T00:00:00.000Z",
        );
        expect(
            new TextDecoder().decode(refreshed?.body ?? new Uint8Array()),
        ).toBe("cached body");
    });

    it("skips the background write when the object was refreshed recently", async () => {
        const bucket = createTestR2Bucket();
        await bucket.put("cache-key", "cached body");

        const cached = await bucket.get("cache-key");
        expect(cached).not.toBeNull();
        if (!cached) throw new Error("Expected seeded R2 object");

        const pending: Promise<unknown>[] = [];
        const responseBody = refreshR2ObjectTtl(
            bucket,
            "cache-key",
            cached,
            (promise) => pending.push(promise),
            () => {},
            {
                now: () =>
                    new Date(
                        cached.uploaded.getTime() +
                            DEFAULT_R2_TTL_REFRESH_INTERVAL_MS -
                            1,
                    ),
            },
        );

        expect(await new Response(responseBody).text()).toBe("cached body");
        await Promise.all(pending);
        expect(bucket.putCount).toBe(1);
    });
});
