import { Hono } from "hono";
import { describe, expect, test, vi } from "vitest";
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

describe("status notice routes", () => {
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

    test("publishes, updates, and clears a notice", async () => {
        const { app, env, kv } = createHarness();
        const publishResponse = await app.fetch(
            adminRequest({
                message: " Maintenance is in progress. ",
                linkUrl: "https://status.pollinations.ai",
                linkLabel: "Status page",
            }),
            env,
        );
        expect(publishResponse.status).toBe(200);
        const published = (await publishResponse.json()) as {
            notice: StatusNotice;
        };
        expect(published.notice).toMatchObject({
            message: "Maintenance is in progress.",
            linkUrl: "https://status.pollinations.ai",
            linkLabel: "Status page",
        });
        expect(kv.put).toHaveBeenCalledTimes(1);

        const publicResponse = await app.fetch(
            new Request("http://localhost/status-notice"),
            env,
        );
        expect(await publicResponse.json()).toEqual(published);

        const updateResponse = await app.fetch(
            adminRequest({ message: "Systems are recovering." }),
            env,
        );
        const updated = (await updateResponse.json()) as {
            notice: StatusNotice;
        };
        expect(updated.notice.message).toBe("Systems are recovering.");
        expect(updated.notice.linkUrl).toBeNull();

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
    });

    test.each([
        [{}, "missing message"],
        [{ message: "   " }, "blank message"],
        [{ message: "x".repeat(501) }, "long message"],
        [
            { message: "Unsafe", linkUrl: "javascript:alert(1)" },
            "javascript link",
        ],
        [
            { message: "Unsafe", linkUrl: "mailto:test@example.com" },
            "mailto link",
        ],
        [{ message: "Unsafe", linkUrl: "data:text/html,unsafe" }, "data link"],
    ])("rejects %s (%s)", async (body) => {
        const { app, env, kv } = createHarness();
        const response = await app.fetch(adminRequest(body), env);
        expect(response.status).toBe(400);
        expect(kv.put).not.toHaveBeenCalled();
    });
});
