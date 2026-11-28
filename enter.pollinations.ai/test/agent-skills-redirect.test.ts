import { SELF } from "cloudflare:test";
import { describe, expect, test } from "vitest";

describe("enter /.well-known/agent-skills cross-service redirect", () => {
    test("redirects to the gen skills index with 308 and no auth", async () => {
        const response = await SELF.fetch(
            "https://enter.pollinations.ai/.well-known/agent-skills/index.json",
            { redirect: "manual" },
        );

        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe(
            "https://gen.pollinations.ai/.well-known/agent-skills/index.json",
        );
    });

    test("supports HEAD, as the discovery RFC requires", async () => {
        const response = await SELF.fetch(
            "https://enter.pollinations.ai/.well-known/agent-skills/index.json",
            { method: "HEAD", redirect: "manual" },
        );

        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe(
            "https://gen.pollinations.ai/.well-known/agent-skills/index.json",
        );
    });

    test("maps staging.enter to staging.gen (no self-redirect)", async () => {
        const response = await SELF.fetch(
            "https://staging.enter.pollinations.ai/.well-known/agent-skills/index.json",
            { redirect: "manual" },
        );

        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe(
            "https://staging.gen.pollinations.ai/.well-known/agent-skills/index.json",
        );
    });

    test("maps dev.enter to dev.gen (no self-redirect)", async () => {
        const response = await SELF.fetch(
            "https://dev.enter.pollinations.ai/.well-known/agent-skills/index.json",
            { redirect: "manual" },
        );

        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe(
            "https://dev.gen.pollinations.ai/.well-known/agent-skills/index.json",
        );
    });
});
