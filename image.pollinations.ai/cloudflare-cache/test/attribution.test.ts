import { proxy } from "hono/proxy";
import { describe, expect, it, vi } from "vitest";
import {
    ATTRIBUTION_HEADERS,
    addAttributionHeaders,
} from "../src/attribution.ts";
import { CACHE_VERSION, generateCacheKey } from "../src/cache-utils.ts";
import { getVersionedSemanticBucket } from "../src/middleware/semantic-cache.ts";
import { originHeaders } from "../src/util.ts";

describe("endpoint branding", () => {
    it("adds the Pollinations link and logo headers", () => {
        const headers = new Headers();

        addAttributionHeaders(headers);

        for (const [name, value] of Object.entries(ATTRIBUTION_HEADERS)) {
            expect(headers.get(name)).toBe(value);
        }
    });

    it("versions exact cache keys so old unbranded images are bypassed", () => {
        const first = generateCacheKey(
            new URL(
                "https://image.pollinations.ai/prompt/flower?width=512&height=512",
            ),
        );
        const reordered = generateCacheKey(
            new URL(
                "https://image.pollinations.ai/prompt/flower?height=512&width=512",
            ),
        );

        expect(first).toBe(reordered);
        expect(first.startsWith(`${CACHE_VERSION}-`)).toBe(true);
    });

    it("versions semantic cache buckets so old unbranded images are bypassed", () => {
        expect(getVersionedSemanticBucket("1024x1024_nologofalse")).toBe(
            `${CACHE_VERSION}-1024x1024_nologofalse`,
        );
    });
});

describe("origin request", () => {
    it("drops a client-sent cloudfront-viewer-address so callers cannot pick their IP", async () => {
        let sent: Request | undefined;
        vi.stubGlobal("fetch", async (request: Request) => {
            sent = request;
            return new Response("ok");
        });
        try {
            await proxy("https://image-origin.pollinations.ai/prompt/cat", {
                headers: originHeaders(
                    {
                        host: "image.pollinations.ai",
                        "cloudfront-viewer-address": "203.0.113.9:443",
                    },
                    "198.51.100.7",
                ),
            });
        } finally {
            vi.unstubAllGlobals();
        }

        expect(sent?.headers.get("cloudfront-viewer-address")).toBeNull();
        expect(sent?.headers.get("x-forwarded-for")).toBe("198.51.100.7");
        expect(sent?.headers.get("cf-connecting-ip")).toBe("198.51.100.7");
        expect(sent?.headers.get("x-forwarded-host")).toBe(
            "image.pollinations.ai",
        );
    });
});
