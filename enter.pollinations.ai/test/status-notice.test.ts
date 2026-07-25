import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Env } from "../src/env.ts";
import {
    type StatusNotice,
    statusNoticeAdminRoutes,
    statusNoticePublicRoutes,
} from "../src/routes/status-notice.ts";

function createHarness() {
    let stored: string | null = null;
    const kv = {
        get: vi.fn(async (_key: string, type?: string) =>
            type === "json" && stored ? JSON.parse(stored) : stored,
        ),
        put: vi.fn(async (_key: string, value: string) => {
            stored = value;
        }),
        delete: vi.fn(async () => {
            stored = null;
        }),
    };
    const env = {
        PLN_ENTER_TOKEN: "test-admin-token",
        KV: kv,
    } as unknown as Env["Bindings"];
    const app = new Hono<Env>()
        .route("/status-notice", statusNoticePublicRoutes)
        .route("/admin/status-notice", statusNoticeAdminRoutes);

    return { app, env, kv };
}

function adminRequest(body: unknown, token = "test-admin-token"): Request {
    return new Request("http://localhost/admin/status-notice", {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

async function publish(
    app: Hono<Env>,
    env: Env["Bindings"],
    payload: unknown,
): Promise<{ status: number; body: { notice: StatusNotice | null } }> {
    const res = await app.fetch(adminRequest(payload), env);
    return { status: res.status, body: (await res.json()) as never };
}

describe("status notice routes", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    test("returns null when no notice is active", async () => {
        const { app, env } = createHarness();
        const response = await app.fetch(
            new Request("http://localhost/status-notice"),
            env,
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ notice: null });
    });

    test.each([
        "PUT",
        "DELETE",
    ])("%s requires the admin token", async (method) => {
        const { app, env } = createHarness();
        const response = await app.fetch(
            new Request("http://localhost/admin/status-notice", {
                method,
                headers: { "Content-Type": "application/json" },
                body:
                    method === "PUT"
                        ? JSON.stringify({ message: "Test" })
                        : undefined,
            }),
            env,
        );
        expect(response.status).toBe(401);
    });

    test.each([
        "PUT",
        "DELETE",
    ])("%s rejects the wrong token", async (method) => {
        const { app, env } = createHarness();
        const response = await app.fetch(adminRequest({}, "wrong"), env);
        if (method === "DELETE") {
            // Re-issue as DELETE with the wrong token.
            const res = await app.fetch(
                new Request("http://localhost/admin/status-notice", {
                    method: "DELETE",
                    headers: { Authorization: "Bearer wrong" },
                }),
                env,
            );
            expect(res.status).toBe(401);
        } else {
            expect(response.status).toBe(401);
        }
    });

    test("PUT rejects malformed JSON body", async () => {
        const { app, env } = createHarness();
        const response = await app.fetch(
            new Request("http://localhost/admin/status-notice", {
                method: "PUT",
                headers: {
                    Authorization: "Bearer test-admin-token",
                    "Content-Type": "application/json",
                },
                body: "not json",
            }),
            env,
        );
        expect(response.status).toBe(400);
    });

    test("publishes, persists to KV, and is readable from the public route", async () => {
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const { app, env, kv } = createHarness();

        const published = await publish(app, env, {
            message: " Maintenance is in progress. ",
            linkUrl: "https://status.pollinations.ai",
            linkLabel: "Status page",
            severity: "info",
        });
        expect(published.status).toBe(200);
        expect(published.body.notice).toMatchObject({
            message: "Maintenance is in progress.",
            severity: "info",
            linkUrl: "https://status.pollinations.ai",
            linkLabel: "Status page",
            updatedAt: "2026-01-01T00:00:00.000Z",
        });
        expect(kv.put).toHaveBeenCalledTimes(1);

        const publicResponse = await app.fetch(
            new Request("http://localhost/status-notice"),
            env,
        );
        expect(await publicResponse.json()).toEqual(published.body);
    });

    test("severity defaults to warning when omitted", async () => {
        const { app, env } = createHarness();
        const published = await publish(app, env, {
            message: "Default severity",
        });
        expect(published.body.notice?.severity).toBe("warning");
    });

    test("severity is echoed when explicitly provided", async () => {
        const { app, env } = createHarness();
        const published = await publish(app, env, {
            message: "Critical",
            severity: "critical",
        });
        expect(published.body.notice?.severity).toBe("critical");
    });

    test("strips link fields when linkUrl is omitted", async () => {
        const { app, env } = createHarness();
        const published = await publish(app, env, {
            message: "No link here",
            linkLabel: "should be dropped",
        });
        expect(published.body.notice?.linkUrl).toBeNull();
        expect(published.body.notice?.linkLabel).toBeNull();
    });

    test("updates a notice and overwrites the previous payload", async () => {
        const { app, env } = createHarness();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const first = await publish(app, env, { message: "First" });

        vi.setSystemTime(new Date("2026-01-01T01:00:00.000Z"));
        const second = await publish(app, env, { message: "Second" });
        expect(second.body.notice?.message).toBe("Second");
        expect(second.body.notice?.linkUrl).toBeNull();
        expect(second.body.notice?.updatedAt).toBe("2026-01-01T01:00:00.000Z");
        expect(second.body.notice?.updatedAt).not.toBe(
            first.body.notice?.updatedAt,
        );
    });

    test("idempotent re-save preserves updatedAt and skips the KV write", async () => {
        const { app, env, kv } = createHarness();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const first = await publish(app, env, {
            message: "Same",
            severity: "warning",
        });
        expect(kv.put).toHaveBeenCalledTimes(1);

        // Same payload again — should be a no-op.
        vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
        const second = await publish(app, env, {
            message: "Same",
            severity: "warning",
        });
        expect(second.status).toBe(200);
        expect(second.body.notice).toEqual(first.body.notice);
        expect(kv.put).toHaveBeenCalledTimes(1); // unchanged — no new write

        // A genuinely different payload bumps updatedAt and writes again.
        vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z"));
        const third = await publish(app, env, { message: "Changed" });
        expect(third.body.notice?.updatedAt).not.toBe(
            first.body.notice?.updatedAt,
        );
        expect(kv.put).toHaveBeenCalledTimes(2);
    });

    test("clears the notice and the public route reads null", async () => {
        const { app, env, kv } = createHarness();
        await publish(app, env, { message: "Will be cleared" });

        const clearResponse = await app.fetch(
            new Request("http://localhost/admin/status-notice", {
                method: "DELETE",
                headers: { Authorization: "Bearer test-admin-token" },
            }),
            env,
        );
        expect(clearResponse.status).toBe(200);
        expect(await clearResponse.json()).toEqual({ notice: null });
        expect(kv.delete).toHaveBeenCalledTimes(1);

        const publicResponse = await app.fetch(
            new Request("http://localhost/status-notice"),
            env,
        );
        expect(await publicResponse.json()).toEqual({ notice: null });
    });

    test("ignores a corrupted KV payload and returns null", async () => {
        const { app, env, kv } = createHarness();
        kv.get.mockResolvedValueOnce({ garbage: true, noFields: true });
        // Inject a corrupted stored value via the real put path on a different mock state.
        kv.get.mockImplementationOnce(async () => ({ weird: "shape" }));
        const response = await app.fetch(
            new Request("http://localhost/status-notice"),
            env,
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ notice: null });
    });

    test.each([
        [{}, "missing message"],
        [{ message: "   " }, "blank message"],
        [{ message: "x".repeat(501) }, "overly long message"],
        [{ message: "Bad severity", severity: "panic" }, "invalid severity"],
        [
            { message: "Unsafe", linkUrl: "javascript:alert(1)" },
            "javascript link",
        ],
        [
            { message: "Unsafe", linkUrl: "mailto:test@example.com" },
            "mailto link",
        ],
        [{ message: "Unsafe", linkUrl: "data:text/html,unsafe" }, "data link"],
        [
            {
                message: "Long link",
                linkUrl: `https://example.com/${"a".repeat(2100)}`,
            },
            "overly long link",
        ],
        [
            {
                message: "Long label",
                linkUrl: "https://example.com",
                linkLabel: "a".repeat(81),
            },
            "overly long label",
        ],
    ])("rejects %s (%s)", async (body) => {
        const { app, env, kv } = createHarness();
        const response = await app.fetch(adminRequest(body), env);
        expect(response.status).toBe(400);
        expect(kv.put).not.toHaveBeenCalled();
    });
});
