import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Admin authentication", () => {
    const baseUrl = "https://enter.pollinations.ai";

    it("should reject requests without token", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/update-tier`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ userId: "test", tier: "seed" }),
            },
        );
        expect(response.status).toBe(401);
    });

    it("should reject requests with invalid token", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/update-tier`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer invalid_token",
                },
                body: JSON.stringify({ userId: "test", tier: "seed" }),
            },
        );
        expect(response.status).toBe(401);
    });

    it("should allow full admin token access to all endpoints", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/update-tier`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
                },
                body: JSON.stringify({ userId: "nonexistent", tier: "seed" }),
            },
        );
        // Will get 404 for non-existent user, but authentication passed
        expect(response.status).toBe(404);
    });

    it("should allow refill token access to trigger-refill only", async () => {
        // Should work for trigger-refill
        const refillResponse = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-refill`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.REFILL_TOKEN}`,
                },
            },
        );
        // Will succeed or skip, but authentication passed
        expect([200]).toContain(refillResponse.status);

        // Should NOT work for update-tier
        const updateResponse = await SELF.fetch(
            `${baseUrl}/api/admin/update-tier`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.REFILL_TOKEN}`,
                },
                body: JSON.stringify({ userId: "test", tier: "seed" }),
            },
        );
        expect(updateResponse.status).toBe(401);
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
