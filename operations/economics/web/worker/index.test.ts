import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

const env = {
    ASSETS: {
        fetch: vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response("private asset", {
                    headers: { "Content-Type": "text/javascript" },
                }),
            ),
        ),
    },
    ECONOMICS_PASSWORD: "correct horse battery staple",
    LOGIN_RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: true }),
    },
    TINYBIRD_API: "https://api.europe-west2.gcp.tinybird.co",
    TINYBIRD_ECONOMICS_READ_TOKEN: "test-token",
    TINYBIRD_POLLEN_PIPE: "economics_pollen_usage_snapshot_api",
};

function request(path: string, init?: RequestInit) {
    return worker.fetch(
        new Request(`https://economics.myceli.ai${path}`, init) as Parameters<
            typeof worker.fetch
        >[0],
        env,
    );
}

async function authenticatedCookie() {
    const response = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: env.ECONOMICS_PASSWORD }),
    });
    return response.headers.get("Set-Cookie") || "";
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    env.LOGIN_RATE_LIMITER.limit.mockResolvedValue({ success: true });
    env.ASSETS.fetch.mockClear();
});

describe("economics Worker auth", () => {
    it("reports an unauthenticated session", async () => {
        const response = await request("/api/auth/session");

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            authenticated: false,
        });
    });

    it("rejects the wrong password", async () => {
        const response = await request("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ password: "wrong" }),
        });

        expect(response.status).toBe(401);
    });

    it("rate limits repeated login attempts", async () => {
        env.LOGIN_RATE_LIMITER.limit.mockResolvedValueOnce({
            success: false,
        });

        const response = await request("/api/auth/login", {
            method: "POST",
            headers: { "CF-Connecting-IP": "192.0.2.1" },
            body: JSON.stringify({ password: env.ECONOMICS_PASSWORD }),
        });

        expect(response.status).toBe(429);
        expect(env.LOGIN_RATE_LIMITER.limit).toHaveBeenCalledWith({
            key: "192.0.2.1",
        });
    });

    it("creates a secure session cookie", async () => {
        const login = await request("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ password: env.ECONOMICS_PASSWORD }),
        });
        const cookie = login.headers.get("Set-Cookie");

        expect(login.status).toBe(204);
        expect(cookie).toContain("HttpOnly; Secure; SameSite=Lax");

        const session = await request("/api/auth/session", {
            headers: { Cookie: cookie || "" },
        });
        await expect(session.json()).resolves.toEqual({ authenticated: true });
    });

    it("rejects an expired signed session", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-24T10:00:00.000Z"));
        const cookie = await authenticatedCookie();
        vi.setSystemTime(new Date("2026-08-24T22:00:01.000Z"));

        const session = await request("/api/auth/session", {
            headers: { Cookie: cookie },
        });

        await expect(session.json()).resolves.toEqual({
            authenticated: false,
        });
    });

    it("rejects pipe reads without a session", async () => {
        const upstream = vi.fn();
        vi.stubGlobal("fetch", upstream);

        const response = await request(
            "/api/pipes/economics_compute_ledger_api",
        );

        expect(response.status).toBe(401);
        expect(upstream).not.toHaveBeenCalled();
    });

    it("rejects pipes outside the read allowlist", async () => {
        const upstream = vi.fn();
        vi.stubGlobal("fetch", upstream);

        const response = await request("/api/pipes/secret_pipe", {
            headers: { Cookie: await authenticatedCookie() },
        });

        expect(response.status).toBe(404);
        expect(upstream).not.toHaveBeenCalled();
    });

    it("forwards an authenticated allowlisted pipe with the read token", async () => {
        const upstream = vi
            .fn()
            .mockResolvedValue(
                Response.json({ data: [{ entry_id: "cloud-1" }] }),
            );
        vi.stubGlobal("fetch", upstream);

        const response = await request(
            "/api/pipes/economics_compute_ledger_api",
            {
                headers: { Cookie: await authenticatedCookie() },
            },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            data: [{ entry_id: "cloud-1" }],
        });
        expect(upstream).toHaveBeenCalledWith(
            `${env.TINYBIRD_API}/v0/pipes/economics_compute_ledger_api.json`,
            {
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_ECONOMICS_READ_TOKEN}`,
                },
            },
        );
    });

    it("keeps revenue-share identity data behind authentication", async () => {
        const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
        vi.stubGlobal("fetch", upstream);

        const unauthorized = await request(
            "/api/pipes/economics_revenue_share_api",
        );
        expect(unauthorized.status).toBe(401);
        expect(upstream).not.toHaveBeenCalled();

        const response = await request(
            "/api/pipes/economics_revenue_share_api",
            { headers: { Cookie: await authenticatedCookie() } },
        );

        expect(response.status).toBe(200);
        expect(upstream).toHaveBeenCalledWith(
            `${env.TINYBIRD_API}/v0/pipes/economics_revenue_share_api.json`,
            {
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_ECONOMICS_READ_TOKEN}`,
                },
            },
        );
    });

    it("keeps aggregate D1 balances behind authentication", async () => {
        const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
        vi.stubGlobal("fetch", upstream);

        const unauthorized = await request(
            "/api/pipes/economics_user_balances_api",
        );
        expect(unauthorized.status).toBe(401);
        expect(upstream).not.toHaveBeenCalled();

        const response = await request(
            "/api/pipes/economics_user_balances_api",
            { headers: { Cookie: await authenticatedCookie() } },
        );

        expect(response.status).toBe(200);
        expect(upstream).toHaveBeenCalledWith(
            `${env.TINYBIRD_API}/v0/pipes/economics_user_balances_api.json`,
            {
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_ECONOMICS_READ_TOKEN}`,
                },
            },
        );
    });

    it("keeps private configuration behind the authenticated pipe proxy", async () => {
        const upstream = vi
            .fn()
            .mockResolvedValue(Response.json({ data: [{ config: "{}" }] }));
        vi.stubGlobal("fetch", upstream);

        const unauthorized = await request(
            "/api/pipes/economics_private_config_api",
        );
        expect(unauthorized.status).toBe(401);
        expect(upstream).not.toHaveBeenCalled();

        const response = await request(
            "/api/pipes/economics_private_config_api",
            { headers: { Cookie: await authenticatedCookie() } },
        );

        expect(response.status).toBe(200);
        expect(upstream).toHaveBeenCalledWith(
            `${env.TINYBIRD_API}/v0/pipes/economics_private_config_api.json`,
            {
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_ECONOMICS_READ_TOKEN}`,
                },
            },
        );
    });

    it("routes Pollen reads to the environment-specific upstream", async () => {
        const upstream = vi.fn().mockResolvedValue(Response.json({ data: [] }));
        vi.stubGlobal("fetch", upstream);

        const response = await request(
            "/api/pipes/economics_pollen_usage_api",
            { headers: { Cookie: await authenticatedCookie() } },
        );

        expect(response.status).toBe(200);
        expect(upstream).toHaveBeenCalledWith(
            `${env.TINYBIRD_API}/v0/pipes/economics_pollen_usage_snapshot_api.json`,
            {
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_ECONOMICS_READ_TOKEN}`,
                },
            },
        );
    });

    it("does not serve application assets before authentication", async () => {
        const response = await request("/");

        expect(response.status).toBe(401);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.get("Content-Security-Policy")).toContain(
            "frame-ancestors 'none'",
        );
        await expect(response.text()).resolves.toContain(
            "Enter the economics password",
        );
        expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    });

    it("serves application assets only after authentication", async () => {
        const cookie = await authenticatedCookie();
        const response = await request("/assets/index.js", {
            headers: { Cookie: cookie },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        await expect(response.text()).resolves.toBe("private asset");
        expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
    });

    it("keeps local development assets available without a session", async () => {
        const response = await worker.fetch(
            new Request("http://127.0.0.1:4180/?fixtures=1") as Parameters<
                typeof worker.fetch
            >[0],
            env,
        );

        expect(response.status).toBe(200);
        expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
    });
});
