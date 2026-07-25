import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { statusNoticeRoutes } from "../src/routes/status-notice.ts";

function mockEnv(): Record<string, unknown> {
    return {
        PLN_ENTER_TOKEN: "test-admin-token",
        KV: {
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        },
    };
}

describe("Status Notice Routes", () => {
    let app: Hono;

    beforeEach(() => {
        vi.restoreAllMocks();
        app = new Hono();
        app.route("/status-notice", statusNoticeRoutes);
    });

    describe("GET /status-notice", () => {
        it("returns null when no notice exists", async () => {
            const env = mockEnv();
            (env.KV.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

            const res = await app.request("/status-notice", {}, env);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.notice).toBeNull();
        });

        it("returns the notice when one exists", async () => {
            const env = mockEnv();
            const notice = {
                message: "System maintenance tonight",
                createdAt: "2026-07-25T00:00:00.000Z",
                createdBy: "admin",
            };
            (env.KV.get as ReturnType<typeof vi.fn>).mockResolvedValue(
                JSON.stringify(notice),
            );

            const res = await app.request("/status-notice", {}, env);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.notice).toEqual(notice);
        });
    });

    describe("PUT /status-notice", () => {
        it("requires admin authorization", async () => {
            const env = mockEnv();
            const res = await app.request(
                "/status-notice",
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Test" }),
                },
                env,
            );
            expect(res.status).toBe(401);
        });

        it("creates a notice with valid input", async () => {
            const env = mockEnv();
            (env.KV.put as ReturnType<typeof vi.fn>).mockResolvedValue(
                undefined,
            );

            const res = await app.request(
                "/status-notice",
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: "Bearer test-admin-token",
                    },
                    body: JSON.stringify({
                        message: "Site is down for maintenance",
                    }),
                },
                env,
            );
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.success).toBe(true);
            expect(data.notice.message).toBe("Site is down for maintenance");
            expect(data.notice.createdBy).toBe("admin");
        });

        it("rejects empty message", async () => {
            const env = mockEnv();
            const res = await app.request(
                "/status-notice",
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: "Bearer test-admin-token",
                    },
                    body: JSON.stringify({ message: "" }),
                },
                env,
            );
            expect(res.status).toBe(400);
        });

        it("rejects message over 500 chars", async () => {
            const env = mockEnv();
            const res = await app.request(
                "/status-notice",
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: "Bearer test-admin-token",
                    },
                    body: JSON.stringify({ message: "x".repeat(501) }),
                },
                env,
            );
            expect(res.status).toBe(400);
        });

        it("rejects invalid link URL", async () => {
            const env = mockEnv();
            const res = await app.request(
                "/status-notice",
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: "Bearer test-admin-token",
                    },
                    body: JSON.stringify({
                        message: "Check this",
                        link: "javascript:alert(1)",
                    }),
                },
                env,
            );
            expect(res.status).toBe(400);
        });
    });

    describe("DELETE /status-notice", () => {
        it("requires admin authorization", async () => {
            const env = mockEnv();
            const res = await app.request(
                "/status-notice",
                { method: "DELETE" },
                env,
            );
            expect(res.status).toBe(401);
        });

        it("clears an existing notice", async () => {
            const env = mockEnv();
            (env.KV.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
                undefined,
            );

            const res = await app.request(
                "/status-notice",
                {
                    method: "DELETE",
                    headers: { Authorization: "Bearer test-admin-token" },
                },
                env,
            );
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.success).toBe(true);
            expect(data.notice).toBeNull();
        });
    });
});
