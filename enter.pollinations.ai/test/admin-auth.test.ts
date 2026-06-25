import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Admin authentication", () => {
    const baseUrl = "https://enter.pollinations.ai";

    it("should reject requests without token", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-refill`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            },
        );
        expect(response.status).toBe(401);
    });

    it("should reject requests with invalid token", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-refill`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer invalid_token",
                },
            },
        );
        expect(response.status).toBe(401);
    });

    it("should allow full admin token access to trigger-refill", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-refill`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
                },
            },
        );
        // Will succeed or skip, but authentication passed
        expect([200]).toContain(response.status);
    });
});
