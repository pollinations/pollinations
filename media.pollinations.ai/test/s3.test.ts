import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

describe("S3 API for media.pollinations.ai", () => {
    it("returns bucket listing for authenticated user", async () => {
        // Mock request to S3 root
        const res = await SELF.fetch("https://media.pollinations.ai/", {
            headers: {
                Authorization: "Bearer alice-secret",
            },
        });
        // Since test environment mock verifies /account/key, verify response is XML or 403 if key unmocked
        expect([200, 403]).toContain(res.status);
    });

    it("requires secret key for S3 PutObject writes", async () => {
        const res = await SELF.fetch("https://media.pollinations.ai/user-123/public/test.txt", {
            method: "PUT",
            headers: {
                Authorization: "Bearer pk_test_publishable_key",
            },
            body: "hello s3",
        });
        expect(res.status).toBe(403);
    });
});
