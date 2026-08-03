import { describe, expect, it } from "vitest";
import {
    ATTRIBUTION_HEADERS,
    addAttributionHeaders,
} from "../src/attribution.ts";
import { CACHE_VERSION, generateCacheKey } from "../src/cache-utils.ts";
import { getVersionedSemanticBucket } from "../src/middleware/semantic-cache.ts";

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
