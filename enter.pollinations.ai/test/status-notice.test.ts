import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { statusNoticeRoutes } from "../src/routes/status-notice.ts";

describe("Status Notice Routes", () => {
    let app: Hono;

    beforeEach(() => {
        app = new Hono();
        app.route("/status-notice", statusNoticeRoutes);
    });

    describe("GET /status-notice", () => {
        it("returns null when no notice is set", async () => {
            const res = await app.request("/status-notice");
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.notice).toBeNull();
        });
    });

    describe("PUT /status-notice", () => {
        it("requires authorization", async () => {
            const res = await app.request("/status-notice", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Test notice" }),
            });
            expect(res.status).toBe(401);
        });

        it("rejects empty message", async () => {
            const res = await app.request("/status-notice", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test-token",
                },
                body: JSON.stringify({ message: "" }),
            });
            expect(res.status).toBe(400);
        });

        it("rejects message over 500 characters", async () => {
            const res = await app.request("/status-notice", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test-token",
                },
                body: JSON.stringify({ message: "x".repeat(501) }),
            });
            expect(res.status).toBe(400);
        });

        it("rejects invalid link URL", async () => {
            const res = await app.request("/status-notice", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test-token",
                },
                body: JSON.stringify({
                    message: "Test notice",
                    link: "not-a-url",
                }),
            });
            expect(res.status).toBe(400);
        });

        it("rejects linkLabel over 100 characters", async () => {
            const res = await app.request("/status-notice", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test-token",
                },
                body: JSON.stringify({
                    message: "Test notice",
                    link: "https://example.com",
                    linkLabel: "x".repeat(101),
                }),
            });
            expect(res.status).toBe(400);
        });

        it("accepts linkLabel up to 100 characters", async () => {
            const res = await app.request("/status-notice", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test-token",
                },
                body: JSON.stringify({
                    message: "Test notice",
                    link: "https://example.com",
                    linkLabel: "x".repeat(100),
                }),
            });
            expect(res.status).toBe(200);
        });

        it("preserves createdAt on no-op PUT with identical content", async () => {
            const putRes = await app.request("/status-notice", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test-token",
                },
                body: JSON.stringify({ message: "Test notice" }),
            });
            expect(putRes.status).toBe(200);
            const firstCreatedAt = (await putRes.json()).notice.createdAt;

            const secondRes = await app.request("/status-notice", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test-token",
                },
                body: JSON.stringify({ message: "Test notice" }),
            });
            expect(secondRes.status).toBe(200);
            const data = await secondRes.json();
            expect(data.notice.createdAt).toBe(firstCreatedAt);
            expect(data.notice.message).toBe("Test notice");
        });
    });

    describe("DELETE /status-notice", () => {
        it("requires authorization", async () => {
            const res = await app.request("/status-notice", {
                method: "DELETE",
            });
            expect(res.status).toBe(401);
        });
    });
});
