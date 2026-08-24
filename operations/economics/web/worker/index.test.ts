import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

const env = {
    ECONOMICS_PASSWORD: "correct horse battery staple",
    LOGIN_RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: true }),
    },
    TINYBIRD_API: "https://api.europe-west2.gcp.tinybird.co",
    TINYBIRD_ECONOMICS_READ_TOKEN: "test-token",
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

        const response = await request("/api/pipes/op_cloud_api");

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

        const response = await request("/api/pipes/op_cloud_api", {
            headers: { Cookie: await authenticatedCookie() },
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            data: [{ entry_id: "cloud-1" }],
        });
        expect(upstream).toHaveBeenCalledWith(
            `${env.TINYBIRD_API}/v0/pipes/op_cloud_api.json`,
            {
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_ECONOMICS_READ_TOKEN}`,
                },
            },
        );
    });
});
