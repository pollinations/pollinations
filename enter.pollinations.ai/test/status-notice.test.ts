import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
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
