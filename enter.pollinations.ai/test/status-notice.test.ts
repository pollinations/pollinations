import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect } from "vitest";
import { test } from "./fixtures.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = "https://enter.pollinations.ai";

function authHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
        "Content-Type": "application/json",
    };
}

async function putNotice(body: unknown) {
    return SELF.fetch(`${BASE_URL}/api/admin/status-notice`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
}

async function deleteNotice() {
    return SELF.fetch(`${BASE_URL}/api/admin/status-notice`, {
        method: "DELETE",
        headers: authHeaders(),
    });
}

async function getNotice() {
    return SELF.fetch(`${BASE_URL}/api/status-notice`);
}

async function getNoticeJson() {
    const res = await getNotice();
    return (await res.json()) as { notice: unknown };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Status Notice API", () => {
    // Clean KV before each test to ensure isolation
    beforeEach(async () => {
        await deleteNotice();
    });

    // ==================================================================
    // GET — public read
    // ==================================================================
    describe("GET /api/status-notice", () => {
        test("returns null when no notice exists", async () => {
            const res = await getNotice();
            expect(res.status).toBe(200);
            const data = (await res.json()) as { notice: null };
            expect(data.notice).toBeNull();
        });

        test("returns the active notice", async () => {
            await putNotice({ message: "Maintenance tonight" });
            const res = await getNotice();
            expect(res.status).toBe(200);
            const data = (await res.json()) as {
                notice: Record<string, unknown>;
            };
            expect(data.notice).toBeDefined();
            expect(data.notice.message).toBe("Maintenance tonight");
            expect(data.notice.severity).toBe("warning"); // default
            expect(typeof data.notice.updatedAt).toBe("string");
        });

        test("returns null after notice is cleared", async () => {
            await putNotice({ message: "Something" });
            await deleteNotice();
            const data = await getNoticeJson();
            expect(data.notice).toBeNull();
        });
    });

    // ==================================================================
    // Authentication
    // ==================================================================
    describe("Authentication", () => {
        test("rejects PUT without token", async () => {
            const res = await SELF.fetch(
                `${BASE_URL}/api/admin/status-notice`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "test" }),
                },
            );
            expect(res.status).toBe(401);
        });

        test("rejects PUT with wrong token", async () => {
            const res = await SELF.fetch(
                `${BASE_URL}/api/admin/status-notice`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: "Bearer wrong-token",
                    },
                    body: JSON.stringify({ message: "test" }),
                },
            );
            expect(res.status).toBe(401);
        });

        test("rejects DELETE without token", async () => {
            const res = await SELF.fetch(
                `${BASE_URL}/api/admin/status-notice`,
                { method: "DELETE" },
            );
            expect(res.status).toBe(401);
        });

        test("rejects DELETE with wrong token", async () => {
            const res = await SELF.fetch(
                `${BASE_URL}/api/admin/status-notice`,
                {
                    method: "DELETE",
                    headers: { Authorization: "Bearer wrong-token" },
                },
            );
            expect(res.status).toBe(401);
        });
    });

    // ==================================================================
    // Validation — PUT
    // ==================================================================
    describe("PUT validation", () => {
        test("rejects missing message", async () => {
            const res = await putNotice({});
            expect(res.status).toBe(400);
        });

        test("rejects empty message", async () => {
            const res = await putNotice({ message: "" });
            expect(res.status).toBe(400);
        });

        test("rejects message over 500 characters", async () => {
            const res = await putNotice({ message: "x".repeat(501) });
            expect(res.status).toBe(400);
        });

        test("accepts message at exactly 500 characters", async () => {
            const msg = "x".repeat(500);
            const res = await putNotice({ message: msg });
            expect(res.status).toBe(200);
        });

        test("rejects invalid severity", async () => {
            const res = await putNotice({
                message: "test",
                severity: "urgent",
            });
            expect(res.status).toBe(400);
        });

        test("accepts each valid severity", async () => {
            for (const severity of ["info", "warning", "critical"]) {
                const res = await putNotice({
                    message: `test-${severity}`,
                    severity,
                });
                expect(res.status).toBe(200);
                const data = (await res.json()) as {
                    notice: { severity: string };
                };
                expect(data.notice.severity).toBe(severity);
                // Clean up for next iteration
                await deleteNotice();
            }
        });

        test("rejects javascript: URL", async () => {
            const res = await putNotice({
                message: "test",
                linkUrl: "javascript:alert(1)",
            });
            expect(res.status).toBe(400);
        });

        test("rejects data: URL", async () => {
            const res = await putNotice({
                message: "test",
                linkUrl: "data:text/html,<script>alert(1)</script>",
            });
            expect(res.status).toBe(400);
        });

        test("rejects mailto: URL", async () => {
            const res = await putNotice({
                message: "test",
                linkUrl: "mailto:admin@example.com",
            });
            expect(res.status).toBe(400);
        });

        test("rejects relative URL", async () => {
            const res = await putNotice({
                message: "test",
                linkUrl: "/admin/status",
            });
            expect(res.status).toBe(400);
        });

        test("accepts valid http(s) URL", async () => {
            const res = await putNotice({
                message: "Outage",
                linkUrl: "https://status.example.com",
            });
            expect(res.status).toBe(200);
            const data = (await res.json()) as {
                notice: { linkUrl: string };
            };
            expect(data.notice.linkUrl).toBe("https://status.example.com");
        });

        test("rejects linkLabel over 100 characters", async () => {
            const res = await putNotice({
                message: "test",
                linkUrl: "https://example.com",
                linkLabel: "x".repeat(101),
            });
            expect(res.status).toBe(400);
        });

        test("accepts linkLabel at exactly 100 characters", async () => {
            const label = "x".repeat(100);
            const res = await putNotice({
                message: "test",
                linkUrl: "https://example.com",
                linkLabel: label,
            });
            expect(res.status).toBe(200);
        });

        test("rejects linkLabel without linkUrl", async () => {
            const res = await putNotice({
                message: "test",
                linkLabel: "Click here",
            });
            expect(res.status).toBe(400);
        });

        test("rejects malformed JSON body", async () => {
            const res = await SELF.fetch(
                `${BASE_URL}/api/admin/status-notice`,
                {
                    method: "PUT",
                    headers: authHeaders(),
                    body: "not-json",
                },
            );
            expect(res.status).toBe(400);
        });
    });

    // ==================================================================
    // CRUD flow
    // ==================================================================
    describe("CRUD flow", () => {
        test("publish → read → update → read → clear → read null", async () => {
            // Publish
            const put1 = await putNotice({
                message: "Service degradation",
                severity: "warning",
            });
            expect(put1.status).toBe(200);
            const n1 = (await put1.json()) as {
                notice: { updatedAt: string };
            };
            const ts1 = n1.notice.updatedAt;

            // Read
            const get1 = await getNoticeJson();
            expect(get1.notice).toBeDefined();
            expect((get1.notice as Record<string, unknown>).message).toBe(
                "Service degradation",
            );

            // Update
            const put2 = await putNotice({
                message: "Service restored",
                severity: "info",
                linkUrl: "https://status.example.com",
                linkLabel: "Status page",
            });
            expect(put2.status).toBe(200);
            const n2 = (await put2.json()) as {
                notice: { updatedAt: string };
            };
            expect(n2.notice.updatedAt).not.toBe(ts1);

            // Read updated
            const get2 = await getNoticeJson();
            expect((get2.notice as Record<string, unknown>).message).toBe(
                "Service restored",
            );
            expect((get2.notice as Record<string, unknown>).linkUrl).toBe(
                "https://status.example.com",
            );

            // Clear
            const del = await deleteNotice();
            expect(del.status).toBe(200);

            // Read null
            const get3 = await getNoticeJson();
            expect(get3.notice).toBeNull();
        });
    });

    // ==================================================================
    // Idempotency
    // ==================================================================
    describe("Idempotent PUT", () => {
        test("same content preserves updatedAt", async () => {
            const res1 = await putNotice({
                message: "Same notice",
                severity: "info",
                linkUrl: "https://example.com",
                linkLabel: "Details",
            });
            const n1 = (await res1.json()) as {
                notice: { updatedAt: string };
            };
            const ts1 = n1.notice.updatedAt;

            // Wait a tiny bit so a new Date() would differ
            await new Promise((r) => setTimeout(r, 10));

            const res2 = await putNotice({
                message: "Same notice",
                severity: "info",
                linkUrl: "https://example.com",
                linkLabel: "Details",
            });
            const n2 = (await res2.json()) as {
                notice: { updatedAt: string };
            };
            expect(n2.notice.updatedAt).toBe(ts1);
        });

        test("changing content bumps updatedAt", async () => {
            const res1 = await putNotice({ message: "First" });
            const n1 = (await res1.json()) as {
                notice: { updatedAt: string };
            };

            const res2 = await putNotice({ message: "Second" });
            const n2 = (await res2.json()) as {
                notice: { updatedAt: string };
            };
            expect(n2.notice.updatedAt).not.toBe(n1.notice.updatedAt);
        });
    });

    // ==================================================================
    // Edge cases
    // ==================================================================
    describe("Edge cases", () => {
        test("DELETE succeeds when no notice exists", async () => {
            const res = await deleteNotice();
            expect(res.status).toBe(200);
            const data = (await res.json()) as { notice: null };
            expect(data.notice).toBeNull();
        });

        test("PUT stores the notice in KV (survives multiple reads)", async () => {
            await putNotice({ message: "KV test" });
            const read1 = await getNoticeJson();
            const read2 = await getNoticeJson();
            expect((read1.notice as Record<string, unknown>).message).toBe(
                "KV test",
            );
            expect((read2.notice as Record<string, unknown>).message).toBe(
                "KV test",
            );
        });

        test("notice with only message and default severity works", async () => {
            const res = await putNotice({ message: "Minimal notice" });
            expect(res.status).toBe(200);
            const data = (await res.json()) as {
                notice: { severity: string };
            };
            expect(data.notice.severity).toBe("warning");
        });
    });
});
