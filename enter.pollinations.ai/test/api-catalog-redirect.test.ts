import { SELF } from "cloudflare:test";
import { describe, expect, test } from "vitest";

describe("enter /.well-known/api-catalog cross-service redirect", () => {
    test("redirects to the gen api-catalog with 308 and no auth", async () => {
        const response = await SELF.fetch(
            "https://enter.pollinations.ai/.well-known/api-catalog",
            { redirect: "manual" },
        );

        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe(
            "https://gen.pollinations.ai/.well-known/api-catalog",
        );
    });

    test("maps staging.enter to staging.gen (no self-redirect)", async () => {
        const response = await SELF.fetch(
            "https://staging.enter.pollinations.ai/.well-known/api-catalog",
            { redirect: "manual" },
        );

        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe(
            "https://staging.gen.pollinations.ai/.well-known/api-catalog",
        );
    });

    test("maps dev.enter to dev.gen (no self-redirect)", async () => {
        const response = await SELF.fetch(
            "https://dev.enter.pollinations.ai/.well-known/api-catalog",
            { redirect: "manual" },
        );

        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe(
            "https://dev.gen.pollinations.ai/.well-known/api-catalog",
        );
    });
});
